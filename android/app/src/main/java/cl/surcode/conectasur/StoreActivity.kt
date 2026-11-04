package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.text.method.HideReturnsTransformationMethod
import android.text.method.PasswordTransformationMethod
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class StoreActivity : FragmentActivity() {
    private val presentation by lazy { AccessibilityPreferences(applicationContext).read() }
    private val biometric by lazy { BiometricStoreLock(applicationContext) }
    private lateinit var model: StoreViewModel
    private lateinit var reader: SpeechReader
    private lateinit var prompt: BiometricPrompt
    private var biometricAction: String? = null
    private var binding = false
    private var choosingLogo = false
    private val fields = listOf(R.id.shop_edit_name, R.id.shop_edit_description, R.id.shop_edit_type, R.id.shop_edit_sector, R.id.shop_edit_contact)
    private val picker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null && ::model.isInitialized && model.state.value.session != null) {
            val owner = model.state.value.session?.uid
            choosingLogo = true
            lifecycleScope.launch {
                try {
                    val bytes = LogoEncoder.jpeg(contentResolver, uri)
                    if (model.state.value.session?.uid == owner) model.chooseLogo(bytes)
                }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (error: Exception) { model.message(error.message ?: getString(R.string.logo_unavailable), true) }
                finally { choosingLogo = false; render(model.state.value) }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(if (presentation.highContrast) R.style.Theme_ConectaSur_HighContrast else R.style.Theme_ConectaSur)
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        enableEdgeToEdge()
        setContentView(R.layout.activity_store)
        ViewCompat.setAccessibilityHeading(findViewById(R.id.account_title), true)
        val root = findViewById<View>(R.id.account_root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            insets
        }
        applyAccessibility(root, presentation)
        reader = SpeechReader(this) { active -> findViewById<Button>(R.id.account_read).setText(if (active) R.string.stop else R.string.store_read) }
        findViewById<Button>(R.id.account_read).setOnClickListener {
            if (reader.active) reader.stop() else reader.read(speech(), presentation.slowVoice)
        }
        findViewById<Button>(R.id.account_back).setOnClickListener { leave() }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) { override fun handleOnBackPressed() = leave() })
        if (!RepositoryProvider.supabaseReady()) {
            findViewById<TextView>(R.id.account_status).setText(R.string.access_not_configured)
            setEnabled(findViewById(R.id.login_form), false)
            return
        }
        RepositoryProvider.initialize(applicationContext)
        model = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = StoreViewModel(RepositoryProvider.auth(), RepositoryProvider.shops()) as T
        })[StoreViewModel::class.java]
        biometricAction = savedInstanceState?.getString("biometric_action")
        prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val action = biometricAction
                biometricAction = null
                try {
                    val cipher = requireNotNull(result.cryptoObject?.cipher)
                    if (action == "enroll") {
                        val uid = requireNotNull(model.state.value.session?.uid)
                        biometric.finishEnrollment(cipher, uid)
                        model.message("Huella activada en este teléfono.")
                    } else if (action == "unlock") {
                        check(biometric.finishUnlock(cipher))
                        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) model.unlock()
                        else model.lock()
                    }
                } catch (_: Exception) { model.message("No pudimos verificar la huella. Ingresa con tu contraseña.", true) }
                render(model.state.value)
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                val enrolling = biometricAction == "enroll"
                biometricAction = null
                if (enrolling && !biometric.enabled) biometric.clear()
                model.message(if (errorCode in listOf(BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_NEGATIVE_BUTTON, BiometricPrompt.ERROR_CANCELED))
                    "Huella cancelada. Puedes intentar nuevamente o usar tu contraseña." else "Huella no disponible. Puedes ingresar con tu contraseña.", true)
            }
            override fun onAuthenticationFailed() { model.message("No reconocimos la huella. Inténtalo nuevamente.", true) }
        })
        findViewById<Button>(R.id.account_login).setOnClickListener { signIn() }
        findViewById<EditText>(R.id.account_password).setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_DONE) { signIn(); true } else false
        }
        findViewById<CheckBox>(R.id.account_show_password).setOnCheckedChangeListener { _, show ->
            findViewById<EditText>(R.id.account_password).apply {
                transformationMethod = if (show) HideReturnsTransformationMethod.getInstance() else PasswordTransformationMethod.getInstance()
                setSelection(text.length)
            }
        }
        fields.forEach { id -> findViewById<EditText>(id).doAfterTextChanged { if (!binding) captureDraft() } }
        findViewById<CheckBox>(R.id.shop_show_prices).setOnCheckedChangeListener { _, _ -> if (!binding) captureDraft() }
        findViewById<Button>(R.id.shop_save).setOnClickListener { captureDraft(); hideKeyboard(); showStatus(); model.save() }
        findViewById<Button>(R.id.shop_choose_logo).setOnClickListener { captureDraft(); picker.launch("image/*") }
        findViewById<Button>(R.id.shop_remove_logo).setOnClickListener { captureDraft(); model.removeLogo() }
        findViewById<Button>(R.id.shop_reload).setOnClickListener { model.restore() }
        findViewById<Button>(R.id.shop_associations_retry).setOnClickListener { model.retryAssociations() }
        findViewById<Button>(R.id.account_logout).setOnClickListener { discardIfNeeded { logout() } }
        findViewById<Button>(R.id.account_use_password).setOnClickListener { discardIfNeeded { logout() } }
        findViewById<Button>(R.id.account_unlock).setOnClickListener { authenticate(false) }
        findViewById<Button>(R.id.shop_bio_toggle).setOnClickListener {
            if (biometric.enabled) { biometric.clear(); model.message("Huella desactivada. Tu sesión sigue abierta.") }
            else authenticate(true)
        }
        findViewById<Button>(R.id.shop_products).setOnClickListener { discardIfNeeded { startActivity(Intent(this, ProductManagerActivity::class.java)) } }
        findViewById<Button>(R.id.shop_register_sale).setOnClickListener { discardIfNeeded { startActivity(Intent(this, SalesActivity::class.java)) } }
        findViewById<Button>(R.id.shop_history).setOnClickListener { discardIfNeeded { startActivity(Intent(this, SalesActivity::class.java).putExtra("history",true)) } }
        model.start(biometric.enabled)
        render(model.state.value)
        lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.STARTED) { model.state.collect { render(it) } } }
    }

    private fun signIn() {
        if (model.state.value.busy) return
        val email = findViewById<EditText>(R.id.account_email)
        val password = findViewById<EditText>(R.id.account_password)
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email.text.toString().trim()).matches()) {
            email.error = "Escribe un correo válido"; email.requestFocus(); return
        }
        if (password.text.isEmpty()) { password.error = "Escribe tu contraseña"; password.requestFocus(); return }
        val secret = password.text.toString()
        password.text.clear()
        hideKeyboard()
        showStatus()
        model.signIn(email.text.toString(), secret)
    }

    private fun authenticate(enroll: Boolean) {
        if (biometricAction != null || model.state.value.busy) return
        if (!biometric.available()) { model.message(getString(R.string.bio_unavailable), true); return }
        try {
            val cipher = if (enroll) biometric.enrollmentCipher() else biometric.unlockCipher()
            biometricAction = if (enroll) "enroll" else "unlock"
            prompt.authenticate(BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(if (enroll) R.string.bio_enroll_title else R.string.bio_title))
                .setSubtitle(getString(R.string.bio_subtitle)).setAllowedAuthenticators(BIOMETRIC_STRONG)
                .setNegativeButtonText(getString(R.string.bio_cancel)).build(), BiometricPrompt.CryptoObject(cipher))
        } catch (_: Exception) {
            biometricAction = null
            model.message("La huella cambió o no está disponible. Ingresa con tu contraseña para volver a activarla.", true)
        }
    }

    private fun render(state: StoreState) {
        if (!state.locked && !state.busy && state.session == null && biometric.enabled) biometric.clear()
        val privateVisible = !state.locked && state.shop != null
        findViewById<TextView>(R.id.account_title).setText(when {
            state.locked -> R.string.bio_locked
            state.session != null -> R.string.store_title
            else -> R.string.login_title
        })
        findViewById<TextView>(R.id.account_status).apply {
            text = if (state.locked && state.message.isEmpty()) getString(R.string.bio_intro) else state.message
            // El texto también distingue el error; no depende únicamente del color.
            contentDescription = if (state.error) "Atención. $text" else null
        }
        findViewById<View>(R.id.account_progress).isVisible = state.busy || choosingLogo
        findViewById<View>(R.id.login_form).isVisible = !state.locked && state.session == null
        findViewById<View>(R.id.account_locked).isVisible = state.locked
        findViewById<View>(R.id.shop_form).isVisible = privateVisible
        findViewById<View>(R.id.account_logout).isVisible = state.session != null && !state.locked
        findViewById<View>(R.id.shop_reload).isVisible = state.session != null && state.shop == null && !state.locked
        setEnabled(findViewById(R.id.login_form), !state.busy)
        setEnabled(findViewById(R.id.shop_form), !state.busy && !choosingLogo)
        findViewById<View>(R.id.shop_reload).isEnabled = !state.busy
        findViewById<View>(R.id.account_unlock).isEnabled = !state.busy
        findViewById<View>(R.id.account_logout).isEnabled = !state.busy && !choosingLogo
        if (privateVisible) {
            val draft = model.draft ?: state.shop!!
            binding = true
            listOf(draft.name, draft.description, draft.entrepreneurType, draft.sector, draft.contact).forEachIndexed { index, value ->
                findViewById<EditText>(fields[index]).let { if (it.text.toString() != value) it.setText(value) }
            }
            findViewById<CheckBox>(R.id.shop_show_prices).isChecked = draft.showPrices
            binding = false
            findViewById<TextView>(R.id.shop_account).text = getString(R.string.store_account, state.session?.email.orEmpty())
            findViewById<TextView>(R.id.shop_associations).text = getString(R.string.shop_associations_label, associationText(state))
            findViewById<Button>(R.id.shop_associations_retry).isVisible = state.associationsError
            val logo = findViewById<ImageView>(R.id.shop_edit_logo)
            logo.tag = null
            logo.setImageResource(R.drawable.ic_shop_logo)
            model.logoBytes?.let { logo.setImageBitmap(BitmapFactory.decodeByteArray(it, 0, it.size)) }
                ?: PublicImageLoader.load(lifecycleScope, logo, if (model.logoChanged) null else draft.logoUrl, BuildConfig.SUPABASE_URL)
            findViewById<View>(R.id.shop_remove_logo).isEnabled = !state.busy && !choosingLogo && (model.logoBytes != null || draft.logoUrl != null)
            findViewById<Button>(R.id.shop_bio_toggle).setText(if (biometric.enabled) R.string.bio_disable else R.string.bio_enable)
            val available = biometric.available()
            findViewById<View>(R.id.shop_bio_toggle).isEnabled = !state.busy && (biometric.enabled || available)
            findViewById<TextView>(R.id.shop_bio_status).apply {
                isVisible = !available && !biometric.enabled
                setText(R.string.bio_unavailable)
            }
        }
    }

    private fun captureDraft() {
        if (!::model.isInitialized || model.state.value.locked) return
        val base = model.draft ?: return
        val values = fields.map { findViewById<EditText>(it).text.toString() }
        model.edit(base.copy(name = values[0], description = values[1], entrepreneurType = values[2], sector = values[3], contact = values[4],
            showPrices = findViewById<CheckBox>(R.id.shop_show_prices).isChecked))
    }
    private fun setEnabled(view: View, enabled: Boolean) {
        view.isEnabled = enabled
        if (view is ViewGroup) for (index in 0 until view.childCount) setEnabled(view.getChildAt(index), enabled)
    }
    private fun hideKeyboard() { (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(findViewById<View>(R.id.account_root).windowToken, 0) }
    private fun showStatus() { findViewById<ScrollView>(R.id.account_scroll).smoothScrollTo(0, 0) }
    private fun logout() { prompt.cancelAuthentication(); biometricAction = null; biometric.clear(); reader.stop(); model.logout(); showStatus() }
    private fun leave() {
        if (::model.isInitialized && (model.state.value.busy || choosingLogo)) {
            model.message("Espera a que termine la operación antes de salir."); return
        }
        discardIfNeeded { finish() }
    }
    private fun discardIfNeeded(action: () -> Unit) {
        if (!::model.isInitialized || !model.hasChanges()) { action(); return }
        AlertDialog.Builder(this).setTitle(R.string.discard_title).setMessage(R.string.discard_message)
            .setPositiveButton(R.string.discard_button) { _, _ -> action() }
            .setNegativeButton(R.string.keep_editing, null).show()
    }
    private fun speech(): String {
        if (!::model.isInitialized) return getString(R.string.access_not_configured)
        val state = model.state.value
        if (state.locked) return getString(R.string.bio_locked) + ". " + state.message
        if (state.shop == null) return getString(R.string.login_intro) + ". " + state.message
        val shop = model.draft ?: state.shop
        val assocText = associationText(state)
        return "Mi tienda. ${shop.name}. Asociaciones asignadas: $assocText. ${shop.description}. ${shop.entrepreneurType}. ${shop.sector}. Contacto: ${shop.contact}. ${state.message}"
    }
    private fun associationText(state: StoreState): String = when {
        state.associationsError -> getString(R.string.shop_associations_error)
        state.associations.isEmpty() -> getString(R.string.shop_associations_none)
        else -> state.associations.joinToString(", ")
    }
    override fun onSaveInstanceState(outState: Bundle) { outState.putString("biometric_action", biometricAction); super.onSaveInstanceState(outState) }
    override fun onStop() {
        reader.stop()
        if (::model.isInitialized && biometric.enabled) { model.lock(); render(model.state.value) }
        findViewById<EditText>(R.id.account_password).text.clear()
        super.onStop()
    }
    override fun onDestroy() { reader.close(); super.onDestroy() }
}
