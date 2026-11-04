package cl.surcode.conectasur.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.surcode.conectasur.data.BackendException
import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.IOException

data class StoreState(
    val session: Session? = null,
    val shop: Shop? = null,
    val associations: List<String> = emptyList(),
    val associationsError: Boolean = false,
    val busy: Boolean = false,
    val locked: Boolean = false,
    val message: String = "",
    val error: Boolean = false
)

/** Estado retenido al girar el teléfono; las contraseñas nunca se guardan en el modelo. */
class StoreViewModel(private val auth: AuthRepository, private val shops: ShopRepository) : ViewModel() {
    private val mutable = MutableStateFlow(StoreState())
    val state = mutable.asStateFlow()
    var draft: Shop? = null
        private set
    var logoBytes: ByteArray? = null
        private set
    var logoChanged = false
        private set
    private var operation: Job? = null
    private var operationId = 0
    private var started = false

    fun start(requireBiometric: Boolean) {
        if (started) return
        started = true
        if (requireBiometric) mutable.value = StoreState(locked = true) else restore()
    }

    fun restore() = runOperation("Comprobando tu sesión…") {
        val session = auth.currentSession()
        if (session == null) {
            clearDraft()
            mutable.value = StoreState(message = "Ingresa con tu correo y contraseña.")
        } else loadShop(session)
    }

    fun signIn(email: String, password: String) {
        if (email.trim().isEmpty() || password.isEmpty()) {
            message("Escribe tu correo y contraseña.", true)
            return
        }
        runOperation("Iniciando sesión…") { loadShop(auth.signIn(email.trim(), password)) }
    }

    private suspend fun loadShop(session: Session) {
        if (session.role != Role.EMPRENDEDORA || session.shopId.isNullOrBlank()) {
            auth.signOut()
            clearDraft()
            mutable.value = StoreState(message = "Esta cuenta no tiene una tienda asignada. Consulta al administrador.", error = true)
            return
        }
        mutable.value = mutable.value.copy(session = session)
        val shop = shops.getShop(session.shopId) ?: throw IllegalStateException("No encontramos tu tienda. Consulta al administrador.")
        check(shop.id == session.shopId) { "La tienda consultada no coincide con tu cuenta. Vuelve a ingresar." }
        // Un borrador en memoria no reemplaza los datos confirmados por el servidor.
        if (draft?.id != shop.id) draft = shop
        mutable.value = mutable.value.copy(session = session, shop = shop, associations = emptyList(), associationsError = false, message = "", error = false)
        readAssociations(shop.id, session.uid)
    }

    fun retryAssociations() {
        val current = mutable.value
        val shopId = current.shop?.id ?: return
        val uid = current.session?.uid ?: return
        if (current.locked) return
        runOperation("Consultando la asociación de tu tienda…") {
            readAssociations(shopId, uid)
            if (!mutable.value.associationsError) message("Asignación consultada.")
        }
    }

    private suspend fun readAssociations(shopId: String, uid: String) {
        fun sameAccount() = mutable.value.shop?.id == shopId && mutable.value.session?.uid == uid
        try {
            val associations = shops.listShopAssociations(shopId)
            if (sameAccount()) mutable.value = mutable.value.copy(associations = associations, associationsError = false)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) {
            if (error is BackendException && error.status in listOf(401, 403)) throw error
            // Una consulta fallida no demuestra que la tienda no tenga asociación.
            if (sameAccount()) mutable.value = mutable.value.copy(associations = emptyList(), associationsError = true)
        }
    }

    fun edit(shop: Shop) { if (shop.id == mutable.value.shop?.id) draft = shop }
    fun chooseLogo(bytes: ByteArray) { logoBytes = bytes; logoChanged = true; message("Logo listo. Pulsa Guardar cambios para publicarlo.") }
    fun removeLogo() { logoBytes = null; logoChanged = true; draft = draft?.copy(logoUrl = null); message("Pulsa Guardar cambios para quitar el logo.") }
    fun hasChanges() = draft != mutable.value.shop || logoChanged

    fun save() {
        val changed = draft ?: return
        if (mutable.value.locked || mutable.value.session == null) return
        val clean = changed.copy(name = changed.name.trim(), description = changed.description.trim(),
            entrepreneurType = changed.entrepreneurType.trim(), sector = changed.sector.trim(), contact = changed.contact.trim())
        if (clean.name.isBlank() || clean.name.length > 120 || clean.description.length > 1000 ||
            clean.entrepreneurType.length > 120 || clean.sector.length > 240 || clean.contact.length > 240) {
            message("Revisa el nombre y los límites de los campos de la tienda.", true)
            return
        }
        val bytes = logoBytes
        runOperation("Guardando tu tienda…") {
            var value = clean
            if (logoChanged && bytes != null) {
                // uploadLogo confirma la URL en shops; recordarla evita duplicar la subida al reintentar.
                val url = shops.uploadLogo(clean.id, bytes)
                value = value.copy(logoUrl = url)
                draft = value
                logoBytes = null
                logoChanged = false
            }
            shops.updateShop(value)
            val confirmed = shops.getShop(value.id)
                ?: throw IOException("No pudimos comprobar el guardado")
            if (confirmed != value) throw IOException("No pudimos comprobar todos los cambios")
            draft = confirmed
            logoBytes = null
            logoChanged = false
            mutable.value = mutable.value.copy(shop = confirmed, message = "Cambios guardados. Estarán disponibles al volver a abrir la aplicación.", error = false)
        }
    }

    fun lock() { mutable.value = mutable.value.copy(locked = true) }
    fun unlock() { mutable.value = mutable.value.copy(locked = false); restore() }
    fun message(value: String, error: Boolean = false) { mutable.value = mutable.value.copy(message = value, error = error) }
    fun logout(message: String = "Sesión cerrada en este teléfono.") {
        operationId++
        operation?.cancel()
        auth.signOut() // El adaptador elimina los tokens locales antes de suspender la revocación remota.
        clearDraft()
        mutable.value = StoreState(message = message)
    }
    private fun clearDraft() { draft = null; logoBytes = null; logoChanged = false }
    private fun runOperation(status: String, block: suspend () -> Unit) {
        if (mutable.value.busy) return
        mutable.value = mutable.value.copy(busy = true, message = status, error = false)
        val id = ++operationId
        operation = viewModelScope.launch {
            try { block() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                if (error is BackendException && error.status in listOf(401, 403)) {
                    auth.signOut(); clearDraft()
                    mutable.value = StoreState(message = "Tu sesión terminó o no tienes permiso. Vuelve a ingresar.", error = true)
                } else message(when (error) {
                    is IOException -> "No pudimos confirmar la operación. Revisa tu conexión y vuelve a intentar; tus cambios siguen en pantalla."
                    is BackendException -> if (error.status == 400) "Revisa el correo, la contraseña y los datos ingresados." else "No pudimos completar la operación. Inténtalo nuevamente."
                    is IllegalArgumentException, is IllegalStateException -> error.message ?: "Revisa los datos ingresados."
                    else -> "No pudimos completar la operación. Inténtalo nuevamente."
                }, true)
            } finally { if (id == operationId) mutable.value = mutable.value.copy(busy = false) }
        }
    }
}
