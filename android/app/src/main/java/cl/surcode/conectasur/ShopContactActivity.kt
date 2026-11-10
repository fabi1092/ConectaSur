package cl.surcode.conectasur

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.lifecycle.*
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.whatsappNumber
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.launch

class ShopContactActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val settings = AccessibilityPreferences(applicationContext).read()
        setTheme(if (settings.highContrast) R.style.Theme_ConectaSur_HighContrast else R.style.Theme_ConectaSur)
        super.onCreate(savedInstanceState)
        val root = ScrollView(this)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; val p = (24 * resources.displayMetrics.density).toInt(); setPadding(p,p,p,p) }
        root.addView(layout); setContentView(root)
        fun label(parent: LinearLayout, text: String) = TextView(this).apply { this.text = text; textSize = 18f; parent.addView(this) }
        fun button(parent: LinearLayout, text: String) = Button(this).apply { this.text = text; parent.addView(this, LinearLayout.LayoutParams(-1,-2)) }
        button(layout, "Volver a la tienda").setOnClickListener { finish() }
        val title = label(layout, "Contacta a la tienda").apply { textSize = 28f; ViewCompat.setAccessibilityHeading(this,true) }
        val status = label(layout, "").apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        val whatsapp = button(layout, getString(R.string.contact_whatsapp)).apply { isVisible = false }
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; isVisible = false; layout.addView(this) }
        label(form, getString(R.string.contact_privacy))
        fun input(id: Int, title: Int, max: Int, multiline: Boolean = false): EditText {
            val heading = label(form, getString(title)).apply { labelFor = id }
            return EditText(this).apply {
                this.id = id; textSize = 18f
                inputType = if(multiline) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE else InputType.TYPE_CLASS_TEXT
                if(multiline) minLines = 4
                filters = arrayOf(android.text.InputFilter.LengthFilter(max))
                importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
                form.addView(this, LinearLayout.LayoutParams(-1,-2))
            }
        }
        val name = input(R.id.contact_name, R.string.contact_name,100)
        val reply = input(R.id.contact_reply, R.string.contact_reply,240)
        val body = input(R.id.contact_body, R.string.contact_body,2000,true)
        label(form, "O elige una consulta rápida con un toque:")
        listOf(
            "¿Tienes disponible este producto?",
            "¿En qué feria entregas?",
            "Llámame por favor"
        ).forEach { template ->
            button(form, template).setOnClickListener {
                body.setText(template)
                body.setSelection(template.length)
            }
        }
        val send = button(form,getString(R.string.contact_send))
        applyAccessibility(layout, settings)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left,safe.top,safe.right,safe.bottom); insets
        }
        RepositoryProvider.initialize(applicationContext)
        if (!RepositoryProvider.supabaseReady()) { status.text = "El contacto requiere la versión conectada de ConectaSur."; return }
        val model = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = ContactViewModel(RepositoryProvider.shops(), RepositoryProvider.messages()) as T
        })[ContactViewModel::class.java]
        model.load(intent.getStringExtra("shop_id").orEmpty())
        send.setOnClickListener { model.send(name.text.toString(),reply.text.toString(),body.text.toString()) }
        whatsapp.setOnClickListener {
            val shop = model.state.value.shop ?: return@setOnClickListener
            val number = whatsappNumber(shop.whatsappNumber) ?: return@setOnClickListener
            try { startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://wa.me/$number"))) }
            catch (_: android.content.ActivityNotFoundException) { status.text = "No encontramos una aplicación para abrir WhatsApp." }
        }
        lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED) { model.state.collect { state ->
            title.text = state.shop?.let { "Contacta a ${it.name}" } ?: "Contacta a la tienda"
            status.text = state.message
            whatsapp.isVisible = state.shop?.let { it.contactMode.hasWhatsApp && whatsappNumber(it.whatsappNumber) != null } == true
            form.isVisible = state.shop?.contactMode?.hasForm == true && !state.sent
            listOf(name,reply,body,send).forEach { it.isEnabled = !state.busy }
        } } }
    }
}
