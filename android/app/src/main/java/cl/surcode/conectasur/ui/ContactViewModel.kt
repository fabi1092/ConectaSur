package cl.surcode.conectasur.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class ContactState(val shop: Shop? = null, val busy: Boolean = false, val sent: Boolean = false, val message: String = "")
class ContactViewModel(private val shops: ShopRepository, private val messages: ShopMessageRepository) : ViewModel() {
    private val mutable = MutableStateFlow(ContactState())
    val state = mutable.asStateFlow()
    private var lastPayload: List<String>? = null
    private var requestId = ""
    fun load(id: String) {
        if (mutable.value.busy || mutable.value.shop != null) return
        mutable.value = ContactState(busy = true, message = "Cargando contacto…")
        viewModelScope.launch {
            try {
                val shop = shops.getShop(id) ?: error("Esta tienda ya no está disponible.")
                mutable.value = ContactState(shop = shop)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { mutable.value = ContactState(message = "No pudimos cargar la tienda. Vuelve atrás e intenta nuevamente.") }
        }
    }
    fun send(name: String, contact: String, body: String) {
        val state = mutable.value
        val shop = state.shop ?: return
        if (state.busy || state.sent || !shop.contactMode.hasForm) return
        val values = listOf(name.trim(), contact.trim(), body.trim())
        if (values[0].length !in 1..100 || values[1].length !in 3..240 || values[2].length !in 1..2000) {
            mutable.value = state.copy(message = "Completa tu nombre, un correo o teléfono y tu mensaje.")
            return
        }
        if (values != lastPayload) { lastPayload = values; requestId = UUID.randomUUID().toString() }
        mutable.value = state.copy(busy = true, message = "Enviando mensaje…")
        viewModelScope.launch {
            try {
                messages.send(requestId, shop.id, values[0], values[1], values[2])
                mutable.value = mutable.value.copy(busy = false, sent = true, message = "Mensaje enviado. La tienda te responderá al contacto que indicaste.")
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { mutable.value = mutable.value.copy(busy = false, message = "No pudimos confirmar el envío. Conservamos tus datos; espera unos minutos y reintenta el mismo mensaje.") }
        }
    }
}
