package cl.surcode.conectasur

import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.isVisible
import cl.surcode.conectasur.data.BuyerEngagementStore
import cl.surcode.conectasur.data.RepositoryProvider
import cl.surcode.conectasur.domain.ShopMessage
import cl.surcode.conectasur.domain.whatsappNumber
import cl.surcode.conectasur.ui.applyAccessibility
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

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
        status(if (messages.isEmpty()) getString(R.string.contact_empty) else "${messages.size} mensajes · ${messages.count { !it.read }} sin leer")
    }

    private fun draw() {
        val list = findViewById<LinearLayout>(R.id.inbox_list)
        list.removeAllViews()
        val dp = resources.displayMetrics.density
        val pad = (16 * dp).toInt()
        val dateFmt = DateTimeFormatter.ofPattern("d MMM · HH:mm", Locale.forLanguageTag("es-CL"))
        val chileZone = ZoneId.of("America/Santiago")

        messages.forEach { message ->
            val unread = !message.read
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(pad, pad, pad, pad)
                background = GradientDrawable().apply {
                    cornerRadius = 14 * dp
                    setColor(if (unread) 0xFFFAFCFB.toInt() else 0xFFFFFFFF.toInt())
                    setStroke(
                        ((if (unread) 1.8f else 1f) * dp).toInt(),
                        if (unread) 0xFF1A7B6E.toInt() else 0xFFDDE6E2.toInt()
                    )
                }
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = (12 * dp).toInt() }
            }

            val parsedMs = BuyerEngagementStore.parseIsoTimestampMillis(message.createdAt)
            val dateText = if (parsedMs > 0L) {
                dateFmt.format(java.time.Instant.ofEpochMilli(parsedMs).atZone(chileZone)).replace(".", "")
            } else {
                runCatching {
                    dateFmt.format(OffsetDateTime.parse(message.createdAt).atZoneSameInstant(chileZone)).replace(".", "")
                }.getOrDefault(message.createdAt.take(16))
            }

            val header = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            header.addView(TextView(this).apply {
                text = if (unread) "Nuevo" else "Leído"
                textSize = 12f
                setTypeface(null, Typeface.BOLD)
                setTextColor(if (unread) 0xFFFFFFFF.toInt() else 0xFF4A6560.toInt())
                background = GradientDrawable().apply {
                    cornerRadius = 999 * dp
                    setColor(if (unread) 0xFF1A7B6E.toInt() else 0xFFEDF2F0.toInt())
                }
                setPadding((10 * dp).toInt(), (4 * dp).toInt(), (10 * dp).toInt(), (4 * dp).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = (8 * dp).toInt() }
            })
            header.addView(TextView(this).apply {
                text = message.name
                textSize = 17f
                setTypeface(null, Typeface.BOLD)
                setTextColor(0xFF183A34.toInt())
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            })
            header.addView(TextView(this).apply {
                text = dateText
                textSize = 12f
                setTextColor(0xFF5F746F.toInt())
            })
            card.addView(header)

            card.addView(TextView(this).apply {
                text = "Contacto: ${message.contact}"
                textSize = 14f
                setTypeface(null, Typeface.BOLD)
                setTextColor(0xFF1A7B6E.toInt())
                setTextIsSelectable(true)
                setPadding(0, (8 * dp).toInt(), 0, 0)
            })

            card.addView(TextView(this).apply {
                text = message.body
                textSize = 16f
                setTextColor(0xFF183A34.toInt())
                setTextIsSelectable(true)
                setPadding(0, (8 * dp).toInt(), 0, (12 * dp).toInt())
            })

            val phone = whatsappNumber(message.contact)
            if (phone != null) {
                val replyRow = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    ).apply { bottomMargin = (8 * dp).toInt() }
                }
                replyRow.addView(Button(this).apply {
                    text = "WhatsApp"
                    isAllCaps = false
                    setBackgroundResource(R.drawable.button_primary)
                    setTextColor(0xFFFFFFFF.toInt())
                    minimumHeight = (48 * dp).toInt()
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        marginEnd = (6 * dp).toInt()
                    }
                    setOnClickListener {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone"))) }
                            .onFailure { status("No encontramos una aplicación para abrir WhatsApp.") }
                    }
                })
                replyRow.addView(Button(this).apply {
                    text = "Llamar"
                    isAllCaps = false
                    setBackgroundResource(R.drawable.button_tonal)
                    setTextColor(0xFF183A34.toInt())
                    minimumHeight = (48 * dp).toInt()
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        marginStart = (6 * dp).toInt()
                    }
                    setOnClickListener {
                        runCatching { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+$phone"))) }
                            .onFailure { status("No pudimos abrir el marcador telefónico.") }
                    }
                })
                card.addView(replyRow)
            }

            val utilRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
            }
            utilRow.addView(Button(this).apply {
                text = "Escuchar"
                isAllCaps = false
                setBackgroundResource(R.drawable.button_tonal)
                setTextColor(0xFF183A34.toInt())
                minimumHeight = (48 * dp).toInt()
                layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (unread) marginEnd = (6 * dp).toInt()
                }
                setOnClickListener {
                    speakFeedback("Mensaje de ${message.name}. Contacto: ${message.contact}. Dice: ${message.body}")
                }
            })
            if (unread) {
                utilRow.addView(Button(this).apply {
                    text = getString(R.string.contact_read)
                    isAllCaps = false
                    setBackgroundResource(R.drawable.button_outline)
                    setTextColor(0xFF183A34.toInt())
                    minimumHeight = (48 * dp).toInt()
                    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                        marginStart = (6 * dp).toInt()
                    }
                    setOnClickListener {
                        action("Marcando mensaje…") {
                            RepositoryProvider.messages().markRead(message.id)
                            messages = messages.map { if (it.id == message.id) it.copy(read = true) else it }
                            draw()
                            status("Mensaje marcado como leído.")
                        }
                    }
                })
            }
            card.addView(utilRow)
            list.addView(card)
        }

        findViewById<View>(R.id.inbox_older).isVisible = more
        applyAccessibility(list, settings)
    }
}
