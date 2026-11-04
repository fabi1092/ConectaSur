package cl.surcode.conectasur.ui

import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.data.BackendException
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class BuyerViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val buyer = Session("buyer-1", "buyer@example.cl", Role.COMPRADOR, null)
    private val auth = FakeAuth()
    private val demo = FakeDemo()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }
    private fun model() = BuyerViewModel(auth, demo)

    @Test fun restoresRealBuyerAndLogoutReturnsToVisitorAfterReopening() = runTest(dispatcher) {
        auth.session = buyer
        val vm = model()
        vm.start(); advanceUntilIdle()
        assertEquals(buyer, vm.state.value.session)
        assertFalse(vm.state.value.demo)
        vm.logout()
        assertNull(vm.state.value.session)
        assertNull(auth.session)
        val reopened = model()
        reopened.start(); advanceUntilIdle()
        assertNull(reopened.state.value.session)
    }
    @Test fun disabledGoogleNeverClaimsThereIsASession() = runTest(dispatcher) {
        auth.enabled = false
        val vm = model()
        vm.beginGoogle(); advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertNull(vm.state.value.launchUrl)
        assertFalse(vm.state.value.awaitingGoogle)
        assertEquals(0, auth.starts)
        assertTrue(vm.state.value.message.contains("aún no está disponible"))
    }
    @Test fun startsGoogleOnceAndWaitsForValidatedCallback() = runTest(dispatcher) {
        val vm = model()
        vm.beginGoogle(); vm.beginGoogle(); advanceUntilIdle()
        assertEquals(1, auth.starts)
        assertTrue(vm.state.value.awaitingGoogle)
        assertNull(vm.state.value.session)
        assertNotNull(vm.state.value.launchUrl)
        vm.browserLaunched()
        assertNull(vm.state.value.launchUrl)
        vm.completeGoogle("valid-callback"); advanceUntilIdle()
        assertEquals(buyer, vm.state.value.session)
        assertFalse(vm.state.value.awaitingGoogle)
        assertFalse(vm.state.value.busy)
    }
    @Test fun explicitCancelAndBrowserFailureAllowANewAttempt() = runTest(dispatcher) {
        val vm = model()
        vm.beginGoogle(); advanceUntilIdle()
        vm.cancelGoogle()
        assertFalse(auth.pending)
        assertFalse(vm.state.value.awaitingGoogle)
        assertNull(vm.state.value.session)
        vm.beginGoogle(); advanceUntilIdle()
        assertEquals(2, auth.starts)
        vm.browserUnavailable()
        assertFalse(auth.pending)
        assertTrue(vm.state.value.message.contains("navegador"))
    }
    @Test fun lateCompletionAfterCancelDoesNotReopenBuyerScreen() = runTest(dispatcher) {
        val vm = model()
        vm.beginGoogle(); advanceUntilIdle()
        auth.completeGate = CompletableDeferred()
        vm.completeGoogle("valid-callback"); runCurrent()
        vm.cancelGoogle()
        auth.completeGate!!.complete(Unit); advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertFalse(vm.state.value.awaitingGoogle)
    }
    @Test fun duplicateCallbackDoesNotCancelTheExchangeAlreadyInFlight() = runTest(dispatcher) {
        val vm = model()
        vm.beginGoogle(); advanceUntilIdle()
        auth.completeGate = CompletableDeferred()
        vm.completeGoogle("valid-callback"); runCurrent()
        vm.completeGoogle("duplicate-callback"); runCurrent()
        assertTrue(vm.state.value.busy)
        auth.completeGate!!.complete(Unit); advanceUntilIdle()
        assertEquals(buyer, vm.state.value.session)
        assertFalse(vm.state.value.busy)
    }
    @Test fun aSecondAttemptCannotBeOverwrittenByTheOldCallback() = runTest(dispatcher) {
        val vm = model()
        vm.beginGoogle(); advanceUntilIdle()
        auth.completeGate = CompletableDeferred()
        vm.completeGoogle("old-callback"); runCurrent()
        vm.cancelGoogle()
        vm.beginGoogle(); runCurrent()
        val newUrl = vm.state.value.launchUrl
        auth.completeGate!!.complete(Unit); advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertEquals(newUrl, vm.state.value.launchUrl)
        assertTrue(vm.state.value.awaitingGoogle)
    }
    @Test fun preservesOwnerSessionAndDoesNotOfferReplacementLogin() = runTest(dispatcher) {
        auth.session = buyer.copy(uid = "owner", role = Role.EMPRENDEDORA, shopId = "shop")
        val vm = model()
        vm.start(); advanceUntilIdle()
        vm.beginGoogle(); vm.logout(); advanceUntilIdle()
        assertEquals(Role.EMPRENDEDORA, vm.state.value.session?.role)
        assertEquals(0, auth.starts)
        assertEquals(0, auth.logouts)
    }
    @Test fun networkFailureDoesNotLookLikeDisabledGoogle() = runTest(dispatcher) {
        auth.failure = IOException()
        val vm = model()
        vm.beginGoogle(); advanceUntilIdle()
        assertTrue(vm.state.value.message.contains("conexión"))
        assertFalse(vm.state.value.message.contains("aún no está disponible"))
        assertNull(vm.state.value.session)
    }
    @Test fun demoStatePersistsSeparatelyAndClearsOnLogout() = runTest(dispatcher) {
        val first = BuyerViewModel(null, demo)
        first.enterDemo()
        assertTrue(first.state.value.demo)
        assertTrue(first.state.value.message.contains("No se inició sesión en Google"))
        assertTrue(demo.active())
        val reopened = BuyerViewModel(null, demo)
        reopened.start()
        assertEquals(Role.COMPRADOR, reopened.state.value.session?.role)
        assertTrue(reopened.state.value.demo)
        reopened.logout()
        assertFalse(demo.active())
        assertNull(reopened.state.value.session)
        assertEquals(0, auth.starts)
    }
    @Test fun connectedBuildNeverUsesDemoSession() = runTest(dispatcher) {
        demo.setActive(true)
        val vm = model()
        vm.start(); vm.enterDemo(); advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertFalse(vm.state.value.demo)
        assertFalse(vm.demoAvailable)
    }
    @Test fun unrequestedCallbackDoesNotCreateSession() = runTest(dispatcher) {
        val vm = model()
        vm.completeGoogle("unrequested"); advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertFalse(vm.state.value.awaitingGoogle)
    }
    @Test fun revokedOrExpiredSessionNeverRemainsSignedInOnScreen() = runTest(dispatcher) {
        for (status in listOf(401, 403)) {
            auth.session = buyer
            auth.sessionFailure = null
            val vm = model()
            vm.start(); advanceUntilIdle()
            assertEquals(buyer, vm.state.value.session)
            auth.sessionFailure = BackendException(status, "Sesión rechazada")
            vm.refresh(); advanceUntilIdle()
            assertNull(vm.state.value.session)
            assertNull(auth.session)
            assertFalse(vm.state.value.awaitingGoogle)
            assertTrue(vm.state.value.message.contains("sesión terminó"))
        }
    }

    private class FakeDemo : DemoBuyerStore {
        private var value = false
        override fun active() = value
        override fun setActive(active: Boolean) { value = active }
    }
    private inner class FakeAuth : AuthRepository {
        var session: Session? = null
        var enabled = true
        var pending = false
        var starts = 0
        var logouts = 0
        var failure: Exception? = null
        var sessionFailure: Exception? = null
        var completeGate: CompletableDeferred<Unit>? = null
        override suspend fun signIn(email: String, password: String) = buyer
        override suspend fun currentSession(): Session? { sessionFailure?.let { throw it }; return session }
        override fun signOut() { logouts++; session = null }
        override suspend fun isGoogleEnabled(): Boolean { failure?.let { throw it }; return enabled }
        override fun beginGoogleSignIn(): String { starts++; pending = true; return "https://example.cl/authorize?attempt=$starts" }
        override fun hasPendingGoogleSignIn() = pending
        override fun cancelGoogleSignIn() { pending = false }
        override suspend fun completeGoogleSignIn(callbackUrl: String): Session {
            check(pending) { "Inicia el acceso desde la aplicación." }
            pending = false
            completeGate?.let { gate -> withContext(NonCancellable) { gate.await() } }
            return buyer
        }
    }
}
