package cl.surcode.conectasur.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.surcode.conectasur.data.BackendException
import cl.surcode.conectasur.domain.AuthRepository
import cl.surcode.conectasur.domain.Role
import cl.surcode.conectasur.domain.Session
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.IOException

interface DemoBuyerStore {
    fun active(): Boolean
    fun setActive(active: Boolean)
}

data class BuyerState(
    val session: Session? = null,
    val demo: Boolean = false,
    val busy: Boolean = false,
    val awaitingGoogle: Boolean = false,
    val launchUrl: String? = null,
    val message: String = ""
)

/** El estado de demostración nunca entra en AuthRepository ni se presenta como una cuenta de Google. */
class BuyerViewModel(private val auth: AuthRepository?, private val demoStore: DemoBuyerStore) : ViewModel() {
    private val mutable = MutableStateFlow(BuyerState())
    val state = mutable.asStateFlow()
    val demoAvailable get() = auth == null
    private var job: Job? = null
    private var generation = 0L
    private var started = false

    fun start() { if (!started) { started = true; refresh() } }
    fun refresh() {
        if (mutable.value.busy || mutable.value.awaitingGoogle) return
        if (auth == null) {
            mutable.value = if (demoStore.active()) demoState() else mutable.value.copy(session = null, demo = false)
            return
        }
        operate { id ->
            val session = auth.currentSession()
            val pending = session == null && auth.hasPendingGoogleSignIn()
            publish(id, mutable.value.copy(session = session, demo = false, awaitingGoogle = pending,
                message = if (pending) "Termina el acceso en Google o pulsa Cancelar." else mutable.value.message))
        }
    }
    fun beginGoogle() {
        if (mutable.value.session != null || mutable.value.busy || mutable.value.awaitingGoogle) return
        if (auth == null) {
            mutable.value = mutable.value.copy(message = "Google requiere una versión conectada. Puedes probar la cuenta de demostración.")
            return
        }
        operate { id ->
            if (!auth.isGoogleEnabled()) {
                publish(id, mutable.value.copy(message = "El acceso con Google aún no está disponible. Consulta al equipo de ConectaSur."))
            } else {
                val url = auth.beginGoogleSignIn()
                publish(id, mutable.value.copy(awaitingGoogle = true, launchUrl = url, message = "Continúa en Google para ingresar."))
            }
        }
    }
    fun browserLaunched() { mutable.value = mutable.value.copy(launchUrl = null) }
    fun browserUnavailable() {
        cancelGoogle()
        mutable.value = mutable.value.copy(message = "No pudimos abrir el navegador. Comprueba que haya uno instalado e inténtalo otra vez.")
    }
    fun completeGoogle(callbackUrl: String) {
        if (auth == null) { mutable.value = mutable.value.copy(message = "Esta versión no tiene conexión a Google."); return }
        // Un duplicado no cancela el intercambio legítimo que ya consumió su solicitud.
        if (!auth.hasPendingGoogleSignIn()) {
            if (!mutable.value.busy && mutable.value.session == null) {
                mutable.value = mutable.value.copy(message = "Inicia el acceso con Google desde la aplicación.")
            }
            return
        }
        mutable.value = mutable.value.copy(awaitingGoogle = true)
        operate(replace = true) { id ->
            val session = auth.completeGoogleSignIn(callbackUrl)
            check(session.role == Role.COMPRADOR) { "Esta cuenta no es de comprador. Usa Mi tienda para ingresar." }
            publish(id, BuyerState(session = session, message = "Ingresaste como comprador."))
        }
    }
    fun cancelGoogle() {
        if (!mutable.value.awaitingGoogle && !mutable.value.busy) return
        generation++
        job?.cancel()
        auth?.cancelGoogleSignIn()
        mutable.value = mutable.value.copy(busy = false, awaitingGoogle = false, launchUrl = null,
            message = "Acceso con Google cancelado. Continúas como visitante.")
    }
    fun enterDemo() {
        if (auth != null || mutable.value.busy) return
        demoStore.setActive(true)
        mutable.value = demoState()
    }
    fun logout() {
        if (mutable.value.session == null) return
        generation++
        job?.cancel()
        auth?.cancelGoogleSignIn()
        auth?.signOut()
        demoStore.setActive(false)
        mutable.value = BuyerState(message = "Sesión cerrada. Continúas como visitante.")
    }
    /** La pantalla común asume el acceso; una consulta anterior no puede reemplazar su resultado. */
    fun pauseForAccountAccess() {
        generation++
        job?.cancel()
        auth?.cancelGoogleSignIn()
        mutable.value = mutable.value.copy(busy = false, awaitingGoogle = false, launchUrl = null, message = "")
    }
    private fun demoState() = BuyerState(session = Session("demo-buyer", null, Role.COMPRADOR, null), demo = true,
        message = "Demostración local de comprador. No se inició sesión en Google.")
    private fun publish(id: Long, state: BuyerState) { if (generation == id) mutable.value = state }
    private fun operate(replace: Boolean = false, block: suspend (Long) -> Unit) {
        if (mutable.value.busy && !replace) return
        if (replace) job?.cancel()
        val id = ++generation
        mutable.value = mutable.value.copy(busy = true, launchUrl = null)
        job = viewModelScope.launch {
            try { block(id) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                if (generation != id) return@launch
                if (error is BackendException && error.status in listOf(401, 403)) {
                    auth?.signOut()
                    auth?.cancelGoogleSignIn()
                    mutable.value = BuyerState(message = "Tu sesión terminó o fue desactivada. Vuelve a ingresar.")
                    return@launch
                }
                val message = when (error) {
                    is IOException -> "No pudimos comprobar la conexión. Inténtalo nuevamente."
                    is IllegalStateException, is IllegalArgumentException -> error.message ?: "No pudimos confirmar el acceso."
                    else -> "No pudimos confirmar el acceso con Google. Inténtalo nuevamente."
                }
                if (generation == id) mutable.value = mutable.value.copy(message = message,
                    awaitingGoogle = auth?.hasPendingGoogleSignIn() == true)
            } finally { if (generation == id) mutable.value = mutable.value.copy(busy = false) }
        }
    }
}
