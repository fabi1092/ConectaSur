package cl.surcode.conectasur.ui

import cl.surcode.conectasur.data.BackendException
import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class StoreViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val owner = Session("owner", "test@example.cl", Role.EMPRENDEDORA, "shop")
    private val initial = Shop("shop", "Mi tienda", "Creaciones", null, "Artesanía", "Alerce", "contacto", true)
    private val auth = FakeAuth()
    private val shops = FakeShops()
    private fun model() = StoreViewModel(auth, shops)
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }

    @Test fun savesDataAndRestoresItWithANewScreenAndSession() = runTest(dispatcher) {
        val first = model()
        first.signIn(" test@example.cl ", "secret")
        advanceUntilIdle()
        assertEquals("test@example.cl", auth.lastEmail)
        assertEquals(listOf("Agrupación Alerce Sur"), first.state.value.associations)
        val edited = initial.copy(name = "Taller del sur", description = "Hecho a mano", entrepreneurType = "Tejidos", sector = "Puerto Montt", contact = "+56 9 1234 5678", showPrices = false)
        first.edit(edited)
        first.save()
        advanceUntilIdle()
        assertEquals(edited, first.state.value.shop)
        assertFalse(first.hasChanges())
        val reopened = model()
        reopened.start(false)
        advanceUntilIdle()
        assertEquals(edited, reopened.state.value.shop)
        assertEquals(listOf("Agrupación Alerce Sur"), reopened.state.value.associations)
        reopened.logout()
        assertNull(auth.session)
        assertNull(reopened.draft)
        assertNull(reopened.state.value.shop)
        val signedOut = model()
        signedOut.start(false)
        advanceUntilIdle()
        assertNull(signedOut.state.value.session)
    }

    @Test fun disablingBiometricAccessEndsTheSessionAndRequiresPasswordOnReopen() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        vm.edit(initial.copy(name = "Borrador privado"))
        vm.chooseLogo(byteArrayOf(1))
        val message = "Huella desactivada. Ingresa nuevamente con tu correo y contraseña."
        vm.logout(message)
        assertNull(auth.session)
        assertNull(vm.draft)
        assertNull(vm.logoBytes)
        assertNull(vm.state.value.shop)
        assertEquals(message, vm.state.value.message)
        val reopened = model()
        reopened.start(false)
        advanceUntilIdle()
        assertNull(reopened.state.value.session)
        assertNull(reopened.state.value.shop)
        reopened.signIn("test@example.cl", "secret")
        advanceUntilIdle()
        assertEquals(initial, reopened.state.value.shop)
    }

    @Test fun rejectsBuyerAndDoesNotLoadAnotherStore() = runTest(dispatcher) {
        auth.nextSession = owner.copy(role = Role.COMPRADOR, shopId = null)
        val vm = model()
        vm.signIn("test@example.cl", "secret")
        advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertNull(vm.state.value.shop)
        assertTrue(vm.state.value.error)
        assertEquals(0, shops.reads)
        assertNull(auth.session)
    }

    @Test fun restoresOnlyAfterBiometricUnlock() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(true)
        advanceUntilIdle()
        assertTrue(vm.state.value.locked)
        assertEquals(0, auth.sessionReads)
        assertEquals(0, shops.reads)
        vm.unlock()
        advanceUntilIdle()
        assertFalse(vm.state.value.locked)
        assertEquals(initial, vm.state.value.shop)
    }

    @Test fun networkFailureKeepsDraftAndNeverClaimsSaveSucceeded() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        val edited = initial.copy(name = "Nuevo nombre")
        vm.edit(edited)
        shops.updateFailure = IOException()
        vm.save()
        advanceUntilIdle()
        assertTrue(vm.state.value.error)
        assertEquals(edited, vm.draft)
        assertEquals(initial, vm.state.value.shop)
        assertTrue(vm.hasChanges())
        shops.updateFailure = null
        vm.save()
        advanceUntilIdle()
        assertFalse(vm.state.value.error)
        assertEquals(edited, vm.state.value.shop)
    }

    @Test fun uploadsAndRemovesLogoAndPersistsThePublishedUrl() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        vm.chooseLogo(byteArrayOf(1, 2, 3))
        vm.save()
        advanceUntilIdle()
        assertEquals("https://example.cl/logo.jpg", shops.saved.logoUrl)
        assertEquals(1, shops.uploads)
        vm.removeLogo()
        vm.save()
        advanceUntilIdle()
        assertNull(shops.saved.logoUrl)
        assertEquals(1, shops.uploads)
    }

    @Test fun retriesDetailsAfterLogoUploadWithoutUploadingTheSameImageAgain() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        vm.chooseLogo(byteArrayOf(1))
        vm.edit(initial.copy(name = "Nuevo nombre"))
        shops.updateFailure = IOException()
        vm.save()
        advanceUntilIdle()
        assertTrue(vm.state.value.error)
        assertEquals("https://example.cl/logo.jpg", vm.draft!!.logoUrl)
        shops.updateFailure = null
        vm.save()
        advanceUntilIdle()
        assertEquals(1, shops.uploads)
        assertEquals("Nuevo nombre", shops.saved.name)
        assertFalse(vm.hasChanges())
    }

    @Test fun validationAndLockedScreenPreventWrites() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        vm.edit(initial.copy(name = "   "))
        vm.save()
        advanceUntilIdle()
        assertTrue(vm.state.value.error)
        assertEquals(0, shops.writes)
        vm.edit(initial.copy(name = "Nuevo nombre"))
        vm.lock()
        vm.save()
        advanceUntilIdle()
        assertEquals(0, shops.writes)
    }

    @Test fun finishingARestoreInTheBackgroundDoesNotUnlockTheScreen() = runTest(dispatcher) {
        auth.session = owner
        shops.gate = CompletableDeferred()
        val vm = model()
        vm.start(false)
        runCurrent()
        vm.lock()
        shops.gate!!.complete(Unit)
        advanceUntilIdle()
        assertTrue(vm.state.value.locked)
    }

    @Test fun expiredOrDeactivatedSessionClearsPrivateDraft() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        vm.edit(initial.copy(name = "Cambio privado"))
        shops.updateFailure = BackendException(403, "Desactivada")
        vm.save()
        advanceUntilIdle()
        assertNull(vm.draft)
        assertNull(vm.state.value.shop)
        assertNull(auth.session)
        assertTrue(vm.state.value.error)
    }

    @Test fun missingStoreOffersRetryWithoutPretendingTheUserIsSignedOut() = runTest(dispatcher) {
        auth.session = owner
        shops.readFailure = IOException()
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertEquals(owner, vm.state.value.session)
        assertNull(vm.state.value.shop)
        assertTrue(vm.state.value.error)
        shops.readFailure = null
        vm.restore()
        advanceUntilIdle()
        assertEquals(initial, vm.state.value.shop)
    }

    @Test fun logoutCancelsAnOutstandingStoreLoad() = runTest(dispatcher) {
        auth.session = owner
        shops.gate = CompletableDeferred()
        val vm = model()
        vm.start(false)
        runCurrent()
        vm.logout()
        shops.gate!!.complete(Unit)
        advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertNull(vm.state.value.shop)
        assertNull(vm.draft)
    }

    @Test fun associationFailureIsDifferentFromNoAssignmentAndRetryKeepsTheDraft() = runTest(dispatcher) {
        auth.session = owner
        shops.associationFailure = IOException()
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertEquals(initial, vm.state.value.shop)
        assertTrue(vm.state.value.associationsError)
        assertFalse(vm.state.value.error)
        assertTrue(vm.state.value.associations.isEmpty())
        val draft = initial.copy(name = "Cambio pendiente")
        vm.edit(draft)
        shops.associationFailure = null
        vm.retryAssociations()
        advanceUntilIdle()
        assertFalse(vm.state.value.associationsError)
        assertEquals(listOf("Agrupación Alerce Sur"), vm.state.value.associations)
        assertEquals(draft, vm.draft)
        assertEquals(listOf("shop", "shop"), shops.associationQueries)
        assertEquals(0, shops.writes)
    }

    @Test fun anUnassignedStoreIsNotReportedAsAConnectionError() = runTest(dispatcher) {
        auth.session = owner
        shops.associations = emptyList()
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertTrue(vm.state.value.associations.isEmpty())
        assertFalse(vm.state.value.associationsError)
        assertEquals(listOf("shop"), shops.associationQueries)
    }

    @Test fun logoutWhileAssociationsLoadDoesNotRestoreTheOldSession() = runTest(dispatcher) {
        auth.session = owner
        shops.associationGate = CompletableDeferred()
        val vm = model()
        vm.start(false)
        runCurrent()
        vm.logout()
        shops.associationGate!!.complete(Unit)
        advanceUntilIdle()
        assertNull(vm.state.value.session)
        assertNull(vm.state.value.shop)
        assertNull(vm.draft)
        assertTrue(vm.state.value.associations.isEmpty())
        assertFalse(vm.state.value.associationsError)
    }

    @Test fun unauthorizedAssociationLookupRequiresSigningInAgain() = runTest(dispatcher) {
        auth.session = owner
        shops.associationFailure = BackendException(403, "Cuenta desactivada")
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertNull(auth.session)
        assertNull(vm.state.value.session)
        assertNull(vm.state.value.shop)
        assertTrue(vm.state.value.error)
    }

    @Test fun aMismatchedShopNeverRequestsAnotherStoresAssociations() = runTest(dispatcher) {
        auth.session = owner
        shops.saved = initial.copy(id = "otra-tienda")
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertNull(vm.state.value.shop)
        assertTrue(vm.state.value.associations.isEmpty())
        assertTrue(shops.associationQueries.isEmpty())
        assertTrue(vm.state.value.error)
    }

    @Test fun unavailableChoicesCanBeRetriedWithoutLosingTheDraftOrBlockingOtherEdits() = runTest(dispatcher) {
        auth.session = owner
        shops.choicesFailure = IOException()
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertEquals(initial, vm.state.value.shop)
        assertTrue(vm.state.value.choicesError)
        val edited = initial.copy(name = "Mi taller")
        vm.edit(edited)
        vm.save()
        advanceUntilIdle()
        assertEquals(edited, shops.saved)
        vm.edit(edited.copy(description = "Borrador sin guardar"))
        shops.choicesFailure = null
        vm.retryChoices()
        advanceUntilIdle()
        assertFalse(vm.state.value.choicesError)
        assertEquals(shops.choices, vm.state.value.choices)
        assertEquals("Borrador sin guardar", vm.draft?.description)
        assertEquals(1, shops.writes)
    }

    @Test fun onlyAvailableNewTypesAndSectorsCanBePublished() = runTest(dispatcher) {
        auth.session = owner
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        vm.edit(initial.copy(entrepreneurType = "Tipo inventado"))
        vm.save()
        advanceUntilIdle()
        assertTrue(vm.state.value.error)
        assertEquals(0, shops.writes)
        vm.edit(initial.copy(sector = "Sector inventado"))
        vm.save()
        advanceUntilIdle()
        assertTrue(vm.state.value.error)
        assertEquals(0, shops.writes)
        val chosen = initial.copy(entrepreneurType = "Tejidos", sector = "Puerto Montt")
        vm.edit(chosen)
        vm.save()
        advanceUntilIdle()
        assertEquals(chosen, shops.saved)
        assertFalse(vm.hasChanges())
    }

    @Test fun legacyValuesArePreservedWhenTheAvailableOptionsChange() = runTest(dispatcher) {
        auth.session = owner
        shops.choices = ShopChoices(listOf("Tejidos"), listOf("Puerto Montt"))
        val vm = model()
        vm.start(false)
        advanceUntilIdle()
        assertEquals(initial, vm.draft)
        vm.edit(initial.copy(description = "Nueva descripción"))
        vm.save()
        advanceUntilIdle()
        assertEquals(initial.entrepreneurType, shops.saved.entrepreneurType)
        assertEquals(initial.sector, shops.saved.sector)
        assertFalse(vm.state.value.error)
    }

    private inner class FakeAuth : AuthRepository {
        var session: Session? = null
        var nextSession = owner
        var lastEmail = ""
        var sessionReads = 0
        override suspend fun signIn(email: String, password: String): Session { lastEmail = email; session = nextSession; return nextSession }
        override suspend fun currentSession(): Session? { sessionReads++; return session }
        override fun signOut() { session = null }
    }
    private inner class FakeShops : ShopRepository {
        var choices = ShopChoices(listOf("Artesanía", "Tejidos"), listOf("Alerce", "Puerto Montt"))
        var choicesFailure: Exception? = null
        override suspend fun getShopChoices(): ShopChoices { choicesFailure?.let { throw it }; return choices }
        var saved = initial
        var associations = listOf("Agrupación Alerce Sur")
        val associationQueries = mutableListOf<String>()
        var associationFailure: Exception? = null
        var associationGate: CompletableDeferred<Unit>? = null
        var reads = 0
        var writes = 0
        var uploads = 0
        var updateFailure: Exception? = null
        var readFailure: Exception? = null
        var gate: CompletableDeferred<Unit>? = null
        override suspend fun getShop(shopId: String): Shop { reads++; gate?.await(); readFailure?.let { throw it }; assertEquals("shop", shopId); return saved }
        override suspend fun listShopAssociations(shopId: String): List<String> {
            associationQueries.add(shopId)
            associationGate?.await()
            associationFailure?.let { throw it }
            return associations
        }
        override suspend fun updateShop(shop: Shop) { writes++; updateFailure?.let { throw it }; saved = shop }
        override suspend fun uploadLogo(shopId: String, jpegBytes: ByteArray): String {
            uploads++; val url = "https://example.cl/logo.jpg"; saved = saved.copy(logoUrl = url); return url
        }
    }
}
