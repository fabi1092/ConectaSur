package cl.surcode.conectasur

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.ui.StoreViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Dos invocaciones separadas por force-stop; solo una cuenta y almacén ficticios propios. */
@RunWith(AndroidJUnit4::class)
class SessionPersistenceTest {
    @Test fun restoresSessionAfterProcessRestart() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val args = InstrumentationRegistry.getArguments()
        val phase = args.getString("sessionPhase")
        assumeTrue("Requiere ejecución explícita en dos fases", phase in listOf("sign-in", "restore"))
        val context = instrumentation.targetContext
        val storeName = requireNotNull(args.getString("sessionStore"))
        require(storeName.startsWith("session_persistence_test_"))
        fun client() = SupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY, SecureBackendStore(context, storeName))
        val api = client()
        if (phase == "sign-in") {
            try {
                val session = api.signIn(requireNotNull(args.getString("testEmail")), requireNotNull(args.getString("testPassword")))
                assertEquals(requireNotNull(args.getString("testUid")), session.uid)
                assertEquals(session.uid, client().currentSession()!!.uid)
                // Se deja cifrada en disco para que la recupere el proceso siguiente.
            } catch (error: Throwable) { api.signOut(); throw error }
        } else {
            try {
                val expected = requireNotNull(args.getString("testUid"))
                assertEquals(expected, api.currentSession()!!.uid)
                var model: StoreViewModel? = null
                instrumentation.runOnMainSync {
                    model = StoreViewModel(SupabaseAuthRepository(api), SupabaseShopRepository(api))
                    model!!.start(false)
                }
                val state = withTimeout(30000) { model!!.state.first { !it.busy } }
                assertEquals(expected, state.session!!.uid)
                assertNotNull(state.shop)
                // Renovación real sin volver a ingresar la contraseña.
                api.store.write("auth", api.storedSession()!!.put("expires_at", 0).toString())
                assertEquals(expected, client().currentSession()!!.uid)
                api.signOut()
                assertNull(client().currentSession())
            } finally {
                api.signOut()
                context.deleteSharedPreferences(storeName)
            }
        }
    }
}
