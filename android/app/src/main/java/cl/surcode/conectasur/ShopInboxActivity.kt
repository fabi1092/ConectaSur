package cl.surcode.conectasur

import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.isVisible
import cl.surcode.conectasur.data.RepositoryProvider
import cl.surcode.conectasur.domain.ShopMessage
import cl.surcode.conectasur.ui.applyAccessibility
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

class ShopInboxActivity : OwnerActivity() {
    override val titleText = "Mensajes recibidos"
    private var messages = emptyList<ShopMessage>()
    private var more = false
    override fun onOwnerReady() {
        screen(R.layout.screen_inbox)
        click(R.id.inbox_refresh) { load(false) }
        click(R.id.inbox_older) { load(true) }
        load(false)
    }
    private fun load(older: Boolean) = action("Cargando mensajes…") {
        val requestedShop = shopId
        val requestedOwner = owner.uid
        val page = RepositoryProvider.messages().inbox(requestedShop, if (older) messages.lastOrNull() else null)
        if (owner.uid != requestedOwner || shopId != requestedShop) return@action
        messages = if (older) (messages + page).distinctBy { it.id } else page
        more = page.size == 50
        draw()
        status(if (messages.isEmpty()) getString(R.string.contact_empty) else "${messages.size} mensajes. ${messages.count { !it.read }} sin leer.")
    }
    private fun draw() {
        val list = findViewById<LinearLayout>(R.id.inbox_list)
        list.removeAllViews()
        messages.forEach { message ->
            val block = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 16, 0, 24) }
            val date = runCatching { OffsetDateTime.parse(message.createdAt).atZoneSameInstant(java.time.ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm")) }.getOrDefault(message.createdAt)
            block.addView(TextView(this).apply {
                text = "${if (message.read) "Leído" else "Nuevo"} · $date\n${message.name}\nContacto: ${message.contact}\n\n${message.body}"
                textSize = 18f; setTextIsSelectable(true)
            })
            if (!message.read) block.addView(Button(this).apply {
                setText(R.string.contact_read)
                setOnClickListener { action("Marcando mensaje…") {
                    RepositoryProvider.messages().markRead(message.id)
                    messages = messages.map { if (it.id == message.id) it.copy(read = true) else it }
                    draw(); status("Mensaje marcado como leído.")
                } }
            })
            list.addView(block)
        }
        findViewById<View>(R.id.inbox_older).isVisible = more
        applyAccessibility(list, settings)
    }
}
