package cl.surcode.conectasur

import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import cl.surcode.conectasur.data.AccessibilityPreferences
import cl.surcode.conectasur.data.RepositoryProvider
import cl.surcode.conectasur.domain.whatsappNumber
import cl.surcode.conectasur.ui.ContactViewModel
import cl.surcode.conectasur.ui.applyAccessibility
import kotlinx.coroutines.launch

class ShopContactActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val settings = AccessibilityPreferences(applicationContext).read()
        setTheme(if (settings.highContrast) R.style.Theme_ConectaSur_HighContrast else R.style.Theme_ConectaSur)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_shop_contact)

        val scroll = findViewById<ScrollView>(R.id.contact_scroll)
        val root = findViewById<LinearLayout>(R.id.contact_root)
        val back = findViewById<Button>(R.id.contact_back)
        val doneBack = findViewById<Button>(R.id.contact_done_back)
        val title = findViewById<TextView>(R.id.contact_title)
        val statusCard = findViewById<View>(R.id.contact_status_card)
        val status = findViewById<TextView>(R.id.contact_status)
        val whatsappCard = findViewById<View>(R.id.contact_whatsapp_card)
        val whatsapp = findViewById<Button>(R.id.contact_whatsapp)
        val form = findViewById<View>(R.id.contact_form)
        val name = findViewById<EditText>(R.id.contact_name)
        val reply = findViewById<EditText>(R.id.contact_reply)
        val body = findViewById<EditText>(R.id.contact_body)
        val quickChips = findViewById<LinearLayout>(R.id.contact_quick_chips)
        val send = findViewById<Button>(R.id.contact_send)

        ViewCompat.setAccessibilityHeading(title, true)
        back.setOnClickListener { finish() }
        doneBack.setOnClickListener { finish() }

        val buyerPrefs = getSharedPreferences("buyer_profile", MODE_PRIVATE)
        val savedBuyerName = buyerPrefs.getString("name", "").orEmpty()
        val savedBuyerPhone = buyerPrefs.getString("phone", "").orEmpty()
        val savedBuyerSector = buyerPrefs.getString("sector", "").orEmpty()
        if (savedBuyerName.isNotBlank() && name.text.isNullOrBlank()) {
            name.setText(if (savedBuyerSector.isNotBlank()) "$savedBuyerName ($savedBuyerSector)" else savedBuyerName)
        }
        if (savedBuyerPhone.isNotBlank() && reply.text.isNullOrBlank()) {
            reply.setText(savedBuyerPhone)
        }

        val dp = resources.displayMetrics.density
        listOf(
            "¿Tienes disponible este producto?",
            "¿En qué feria entregas?",
            "Llámame por favor"
        ).forEach { template ->
            quickChips.addView(Button(this).apply {
                text = template
                textSize = 14f
                isAllCaps = false
                setTextColor(0xFF183A34.toInt())
                minimumHeight = (48 * dp).toInt()
                setPadding((14 * dp).toInt(), (8 * dp).toInt(), (14 * dp).toInt(), (8 * dp).toInt())
                background = GradientDrawable().apply {
                    cornerRadius = 999 * dp
                    setColor(0xFFEEF6F4.toInt())
                    setStroke((1 * dp).toInt(), 0xFF9AC5BC.toInt())
                }
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { marginEnd = (8 * dp).toInt() }
                setOnClickListener {
                    body.setText(template)
                    body.setSelection(template.length)
                }
            })
        }

        applyAccessibility(root, settings)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            insets
        }

        RepositoryProvider.initialize(applicationContext)
        if (!RepositoryProvider.supabaseReady()) {
            statusCard.isVisible = true
            status.text = "El contacto requiere la versión conectada de ConectaSur."
            return
        }

        val model = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                ContactViewModel(RepositoryProvider.shops(), RepositoryProvider.messages()) as T
        })[ContactViewModel::class.java]
        model.load(intent.getStringExtra("shop_id").orEmpty())

        send.setOnClickListener {
            model.send(name.text.toString(), reply.text.toString(), body.text.toString())
        }
        whatsapp.setOnClickListener {
            val shop = model.state.value.shop ?: return@setOnClickListener
            val number = whatsappNumber(shop.whatsappNumber) ?: return@setOnClickListener
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$number")))
            } catch (_: android.content.ActivityNotFoundException) {
                statusCard.isVisible = true
                status.text = "No encontramos una aplicación para abrir WhatsApp."
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                model.state.collect { state ->
                    title.text = state.shop?.let { "Contacta a ${it.name}" } ?: "Contacta a la tienda"
                    statusCard.isVisible = state.message.isNotBlank() || state.sent
                    status.text = state.message
                    doneBack.isVisible = state.sent
                    val showWa = state.shop?.let {
                        it.contactMode.hasWhatsApp && whatsappNumber(it.whatsappNumber) != null
                    } == true
                    whatsappCard.isVisible = showWa
                    form.isVisible = state.shop?.contactMode?.hasForm == true && !state.sent
                    listOf(name, reply, body, send, whatsapp).forEach { it.isEnabled = !state.busy }
                }
            }
        }
    }
}
