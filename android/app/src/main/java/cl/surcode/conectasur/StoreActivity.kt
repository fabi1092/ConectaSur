package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
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
import cl.surcode.conectasur.domain.ContactMode
import cl.surcode.conectasur.domain.Role
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
    private var shouldOfferBiometricAfterSignIn = false
    private var offerBiometricDialog: AlertDialog? = null
    private var binding = false
    private var choosingLogo = false
    private var choosingGoogle = false
    private val fields = listOf(R.id.shop_edit_name, R.id.shop_edit_description, R.id.shop_edit_contact, R.id.shop_whatsapp)
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
        if (!BuildConfig.DEBUG) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
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
        shouldOfferBiometricAfterSignIn = savedInstanceState?.getBoolean("should_offer_biometric", false) == true
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
        findViewById<Button>(R.id.account_google_login).setOnClickListener {
            hideKeyboard()
            if(!RepositoryProvider.auth().nativeGoogleAvailable) model.beginGoogle()
            else if(!choosingGoogle && !model.state.value.busy && model.state.value.session==null) {
                choosingGoogle=true
                findViewById<Button>(R.id.account_google_login).isEnabled=false
                lifecycleScope.launch {
                    try { model.signInGoogle(GoogleAccountChooser(this@StoreActivity).requestToken()) }
                    catch(cancelled: kotlinx.coroutines.CancellationException) { RepositoryProvider.auth().cancelGoogleSignIn(); throw cancelled }
                    catch(_: androidx.credentials.exceptions.GetCredentialCancellationException) { model.message("Cancelaste el acceso con Google. Puedes intentarlo nuevamente.") }
                    catch(_: androidx.credentials.exceptions.NoCredentialException) { model.message("Agrega una cuenta de Google en los ajustes del teléfono y vuelve a intentarlo.",true) }
                    catch(_: Exception) { model.message("No pudimos abrir Google. Revisa tu conexión y vuelve a intentarlo.",true) }
                    finally { choosingGoogle=false; render(model.state.value) }
                }
            }
        }
        findViewById<View>(R.id.account_create_link)?.setOnClickListener {
            val dialog = AlertDialog.Builder(this)
                .setTitle("Crear cuenta en ConectaSur")
                .setMessage(
                    "• Modo Comprador (Vecinos):\n" +
                    "Inicia sesión directamente con el botón «Iniciar sesión con Google». Es rápido, seguro y no necesitas crear contraseñas.\n\n" +
                    "• Modo Emprendedora (Dueñas):\n" +
                    "El alta de nuevas tiendas es gestionado por la administración junto a tu asociación en Alerce o Puerto Montt para entregarte tus credenciales de acceso."
                )
                .setPositiveButton("Iniciar con Google") { _, _ ->
                    findViewById<View>(R.id.account_google_login)?.performClick()
                }
                .setNegativeButton("Entendido", null)
                .create()
            dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
            dialog.show()
        }
        findViewById<View>(R.id.account_security_help)?.setOnClickListener {
            val dialog = AlertDialog.Builder(this)
                .setTitle("Seguridad y acceso")
                .setMessage(
                    "• Si olvidaste tu contraseña de emprendedora, solicítala a la administración de la plataforma o a tu asociación.\n\n" +
                    "• Si inicias sesión con Google, tu acceso está protegido por la seguridad de tu propia cuenta de Google.\n\n" +
                    "• Recuerda que en tu tienda puedes activar el acceso rápido con huella digital."
                )
                .setPositiveButton("Entendido", null)
                .create()
            dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
            dialog.show()
        }
        findViewById<View>(R.id.account_privacy_link)?.setOnClickListener {
            val dialog = AlertDialog.Builder(this)
                .setTitle("Cómo cuidamos tu privacidad")
                .setMessage(
                    "En ConectaSur tus datos solo se utilizan para conectar vecinos con emprendimientos locales de Puerto Montt y Alerce.\n\n" +
                    "• No compartimos información personal con terceros.\n" +
                    "• Tus datos de contacto solo se envían a la tienda que decides contactar."
                )
                .setPositiveButton("Cerrar", null)
                .create()
            dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
            dialog.show()
        }
        findViewById<Button>(R.id.account_catalog).setOnClickListener {
            setResult(RESULT_OK, Intent().putExtra(MainActivity.OPEN_CATALOG, true))
            finish()
        }
        val buyerPrefs = getSharedPreferences("buyer_profile", MODE_PRIVATE)
        val buyerNameInput = findViewById<EditText>(R.id.buyer_profile_name)
        val buyerPhoneInput = findViewById<EditText>(R.id.buyer_profile_phone)
        val buyerSectorButton = findViewById<Button>(R.id.buyer_profile_sector)
        val buyerStatus = findViewById<TextView>(R.id.buyer_profile_status)
        buyerNameInput?.setText(buyerPrefs.getString("name", "").orEmpty())
        buyerPhoneInput?.setText(buyerPrefs.getString("phone", "").orEmpty())
        val savedSector = buyerPrefs.getString("sector", "").orEmpty()
        if (savedSector.isNotBlank()) buyerSectorButton?.text = "Sector: $savedSector"
        val defaultSectors = listOf(
            "Alerce Histórico",
            "Alerce Norte",
            "Alerce Sur",
            "Mirasol",
            "Puerto Montt Centro",
            "Valle Volcanes",
            "Angelmó",
            "Pelluco",
            "Chinquihue",
            "Otro sector de Puerto Montt"
        )
        buyerSectorButton?.setOnClickListener {
            val currentSector = buyerPrefs.getString("sector", "").orEmpty()
            val dialog = AlertDialog.Builder(this)
                .setTitle("Elige tu sector en Puerto Montt")
                .setSingleChoiceItems(defaultSectors.toTypedArray(), defaultSectors.indexOf(currentSector)) { dlg, which ->
                    val chosen = defaultSectors[which]
                    buyerPrefs.edit().putString("sector", chosen).apply()
                    buyerSectorButton.text = "Sector: $chosen"
                    dlg.dismiss()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .create()
            dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
            dialog.show()
        }
        findViewById<Button>(R.id.buyer_profile_save)?.setOnClickListener {
            hideKeyboard()
            val nameVal = buyerNameInput?.text?.toString()?.trim().orEmpty()
            val phoneVal = buyerPhoneInput?.text?.toString()?.trim().orEmpty()
            buyerPrefs.edit()
                .putString("name", nameVal)
                .putString("phone", phoneVal)
                .apply()
            buyerStatus?.apply {
                text = "Tus datos de comprador quedaron guardados en este teléfono."
                isVisible = true
            }
        }
        findViewById<Button>(R.id.account_admin_web).setOnClickListener {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://conectasur-dev.web.app/#ingresar"))) }
            catch (_: android.content.ActivityNotFoundException) { model.message("No encontramos un navegador para abrir el panel web.", true) }
        }
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
        findViewById<Button>(R.id.shop_contact_mode).setOnClickListener {
            captureDraft()
            val current = model.draft ?: return@setOnClickListener
            AlertDialog.Builder(this).setTitle(R.string.contact_mode_title)
                .setSingleChoiceItems(ContactMode.entries.map { it.label }.toTypedArray(), current.contactMode.ordinal) { dialog, index ->
                    model.draft?.let { model.edit(it.copy(contactMode = ContactMode.entries[index])) }
                    render(model.state.value); dialog.dismiss()
                }.setNegativeButton(android.R.string.cancel, null).show()
        }
        findViewById<Button>(R.id.shop_messages).setOnClickListener {
            discardIfNeeded { startActivity(Intent(this, ShopInboxActivity::class.java)) }
        }
        findViewById<Button>(R.id.shop_save).setOnClickListener { captureDraft(); hideKeyboard(); showStatus(); model.save() }
        findViewById<Button>(R.id.shop_share_qr)?.setOnClickListener {
            val shop = model.draft ?: model.state.value.shop ?: return@setOnClickListener
            if (shop.id.isBlank()) { model.message("Guarda primero tu tienda para generar su QR.", true); return@setOnClickListener }
            val title = shop.name.ifBlank { "Mi tienda" }
            val subtitle = shop.sector.ifBlank { "ConectaSur" }
            QrShareHelper.showQrDialog(this, title, subtitle, QrShareHelper.shopUrl(shop.id))
        }
        findViewById<EditText>(R.id.shop_pickup_label)?.doAfterTextChanged { if (!binding) captureDraft() }
        findViewById<Button>(R.id.shop_pickup_pick)?.setOnClickListener { openPickupMapDialog() }
        findViewById<Button>(R.id.shop_pickup_clear)?.setOnClickListener {
            val latest = model.draft ?: return@setOnClickListener
            model.edit(latest.copy(pickupLabel = "", pickupLat = null, pickupLng = null))
            model.message("Punto de entrega quitado. Pulsa Guardar cambios para publicar.")
            render(model.state.value)
        }
        findViewById<Button>(R.id.shop_choose_logo).setOnClickListener { captureDraft(); picker.launch("image/*") }
        findViewById<Button>(R.id.shop_remove_logo).setOnClickListener { captureDraft(); model.removeLogo() }
        findViewById<Button>(R.id.shop_reload).setOnClickListener { model.restore() }
        findViewById<Button>(R.id.shop_associations_retry).setOnClickListener { model.retryAssociations() }
        findViewById<Button>(R.id.shop_choices_retry).setOnClickListener { model.retryChoices() }
        findViewById<Button>(R.id.shop_edit_type).setOnClickListener { chooseShopValue(true) }
        findViewById<Button>(R.id.shop_edit_sector).setOnClickListener { chooseShopValue(false) }
        findViewById<Button>(R.id.account_logout).setOnClickListener { discardIfNeeded { logout() } }
        findViewById<Button>(R.id.account_use_password).setOnClickListener { discardIfNeeded { logout() } }
        findViewById<Button>(R.id.account_unlock).setOnClickListener { authenticate(false) }
        findViewById<Button>(R.id.shop_bio_toggle).setOnClickListener {
            if (biometric.enabled) discardIfNeeded {
                logout(getString(R.string.bio_disabled_sign_in))
            }
            else authenticate(true)
        }
        findViewById<Button>(R.id.shop_products).setOnClickListener { discardIfNeeded { startActivity(Intent(this, ProductManagerActivity::class.java)) } }
        findViewById<Button>(R.id.shop_register_sale).setOnClickListener { discardIfNeeded { startActivity(Intent(this, SalesActivity::class.java)) } }
        findViewById<Button>(R.id.shop_history).setOnClickListener { discardIfNeeded { startActivity(Intent(this, SalesActivity::class.java).putExtra("history",true)) } }
        model.start(biometric.enabled && !BiometricStoreLock.isSessionUnlocked())
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
        shouldOfferBiometricAfterSignIn = true
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
        val owner = state.session?.role == Role.EMPRENDEDORA
        val admin = state.session?.role == Role.ADMIN
        val privateVisible = !state.locked && owner && state.shop != null
        val profileVisible = !state.locked && state.session != null && !owner
        findViewById<TextView>(R.id.account_title).setText(when {
            state.locked -> R.string.bio_locked
            owner -> R.string.store_title
            admin -> R.string.account_admin_title
            state.session != null -> R.string.account_buyer_title
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
        findViewById<View>(R.id.account_profile).isVisible = profileVisible
        findViewById<View>(R.id.buyer_profile_card)?.isVisible = profileVisible && !admin
        findViewById<TextView>(R.id.account_profile_badge)?.text =
            if (admin) "Modo administrador · Panel web" else "Modo comprador · Comunidad ConectaSur"
        findViewById<TextView>(R.id.account_profile_email).text = getString(R.string.store_account, state.session?.email.orEmpty())
        findViewById<TextView>(R.id.account_profile_intro).setText(if (admin) R.string.account_admin_intro else R.string.account_buyer_intro)
        findViewById<View>(R.id.account_admin_web).isVisible = profileVisible && admin
        findViewById<View>(R.id.account_logout).isVisible = state.session != null && !state.locked
        findViewById<View>(R.id.shop_reload).isVisible = owner && state.shop == null && !state.locked
        setEnabled(findViewById(R.id.login_form), !state.busy)
        findViewById<View>(R.id.account_google_login).isEnabled = !state.busy && !choosingGoogle
        setEnabled(findViewById(R.id.shop_form), !state.busy && !choosingLogo)
        setEnabled(findViewById(R.id.account_profile), !state.busy)
        findViewById<View>(R.id.shop_reload).isEnabled = !state.busy
        findViewById<View>(R.id.account_unlock).isEnabled = !state.busy
        findViewById<View>(R.id.account_logout).isEnabled = !state.busy && !choosingLogo
        state.googleUrl?.let { url ->
            model.googleBrowserLaunched()
            try { reader.stop(); startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))); finish() }
            catch (_: android.content.ActivityNotFoundException) { model.googleBrowserUnavailable() }
        }
        if (privateVisible) {
            val draft = model.draft ?: state.shop!!
            val storeName = draft.name.ifBlank { state.shop?.name?.ifBlank { "Tu tienda" } ?: "Tu tienda" }
            findViewById<TextView>(R.id.shop_owner_store_name)?.text = storeName
            val sectorText = draft.sector.ifBlank { state.shop?.sector.orEmpty() }
            findViewById<TextView>(R.id.shop_owner_store_sector)?.text =
                if (sectorText.isNotBlank()) "Sector $sectorText · Administra tus productos, ventas y consultas."
                else "Administra tus productos, registra ventas y revisa consultas de clientes."
            binding = true
            listOf(draft.name, draft.description, draft.contact, draft.whatsappNumber).forEachIndexed { index, value ->
                findViewById<EditText>(fields[index]).let { if (it.text.toString() != value) it.setText(value) }
            }
            findViewById<CheckBox>(R.id.shop_show_prices).isChecked = draft.showPrices
            findViewById<EditText>(R.id.shop_pickup_label)?.let {
                val targetLabel = draft.pickupLabel.orEmpty()
                if (it.text.toString() != targetLabel) it.setText(targetLabel)
            }
            binding = false
            findViewById<TextView>(R.id.shop_pickup_coords)?.text =
                if (draft.pickupLat != null && draft.pickupLng != null)
                    String.format(java.util.Locale.US, "Ubicación guardada: %.5f, %.5f", draft.pickupLat, draft.pickupLng)
                else "Sin ubicación guardada"
            findViewById<View>(R.id.shop_pickup_clear)?.isEnabled =
                !state.busy && (draft.pickupLat != null || !draft.pickupLabel.isNullOrBlank())
            findViewById<Button>(R.id.shop_contact_mode).text = draft.contactMode.label
            findViewById<View>(R.id.shop_whatsapp_group).isVisible = draft.contactMode.hasWhatsApp
            bindChoice(R.id.shop_edit_type, draft.entrepreneurType, if (state.choicesError) emptyList() else state.choices.entrepreneurTypes, R.string.shop_choose_type, state)
            bindChoice(R.id.shop_edit_sector, draft.sector, state.choices.sectors, R.string.shop_choose_sector, state)
            findViewById<TextView>(R.id.shop_choices_status).setText(when {
                state.choicesError -> R.string.shop_choices_error
                state.choices.entrepreneurTypes.isEmpty() || state.choices.sectors.isEmpty() -> R.string.shop_choices_empty
                else -> R.string.shop_choices_note
            })
            findViewById<View>(R.id.shop_choices_retry).isVisible = state.choicesError || state.choices.entrepreneurTypes.isEmpty() || state.choices.sectors.isEmpty()
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
            if (shouldOfferBiometricAfterSignIn) {
                shouldOfferBiometricAfterSignIn = false
                if (!biometric.enabled && available && offerBiometricDialog?.isShowing != true) {
                    offerBiometricEnrollmentDialog()
                }
            }
        }
    }

    private fun offerBiometricEnrollmentDialog() {
        val dialog = AlertDialog.Builder(this)
            .setTitle("Activar huella digital")
            .setMessage("¿Quieres activar tu huella digital para entrar más rápido a tu cuenta de emprendedora en este teléfono?")
            .setPositiveButton("Sí, activar huella") { _, _ -> authenticate(true) }
            .setNegativeButton("Ahora no", null)
            .create()
        dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
        offerBiometricDialog = dialog
        dialog.show()
    }

    private fun captureDraft() {
        if (!::model.isInitialized || model.state.value.locked) return
        val base = model.draft ?: return
        val values = fields.map { findViewById<EditText>(it).text.toString() }
        val pickupText = findViewById<EditText>(R.id.shop_pickup_label)?.text?.toString()?.trim().orEmpty()
        model.edit(base.copy(name = values[0], description = values[1], contact = values[2], whatsappNumber = values[3],
            showPrices = findViewById<CheckBox>(R.id.shop_show_prices).isChecked, pickupLabel = pickupText))
    }
    private fun bindChoice(id: Int, current: String, choices: List<String>, action: Int, state: StoreState) {
        findViewById<Button>(id).apply {
            text = current.ifBlank { getString(action) }
            contentDescription = if (current.isBlank()) getString(action) else "${getString(action)}: $current"
            isEnabled = !state.busy && !choosingLogo && choices.isNotEmpty()
        }
    }
    private fun chooseShopValue(type: Boolean) {
        val state = model.state.value
        if (state.busy || state.locked || (type && state.choicesError) || choosingLogo) return
        captureDraft()
        val draft = model.draft ?: return
        val current = if (type) draft.entrepreneurType else draft.sector
        val available = if (type) state.choices.entrepreneurTypes else state.choices.sectors
        if (available.isEmpty()) return
        val choices = available.distinct()
        val dialog = AlertDialog.Builder(this)
            .setTitle(if (type) R.string.shop_choose_type else R.string.shop_choose_sector)
            .setSingleChoiceItems(choices.toTypedArray(), choices.indexOf(current)) { dialog, index ->
                // La selección cambia el borrador; Guardar cambios publica la ficha.
                model.draft?.takeIf { it.id == draft.id && !model.state.value.locked }?.let { latest ->
                    model.edit(if (type) latest.copy(entrepreneurType = choices[index]) else latest.copy(sector = choices[index]))
                    model.message("Pulsa Guardar cambios para publicar tu selección.")
                    render(model.state.value)
                }
                dialog.dismiss()
            }
            .setNegativeButton(android.R.string.cancel, null).create()
        dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
        dialog.show()
    }
    private fun setEnabled(view: View, enabled: Boolean) {
        view.isEnabled = enabled
        if (view is ViewGroup) for (index in 0 until view.childCount) setEnabled(view.getChildAt(index), enabled)
    }
    private fun hideKeyboard() { (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(findViewById<View>(R.id.account_root).windowToken, 0) }
    private fun showStatus() { findViewById<ScrollView>(R.id.account_scroll).smoothScrollTo(0, 0) }
    private fun logout(message: String = "Sesión cerrada en este teléfono.") {
        prompt.cancelAuthentication(); biometricAction = null; biometric.clear(); reader.stop()
        model.logout(message); showStatus()
    }
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
        if (state.session != null && state.session.role != Role.EMPRENDEDORA) {
            return getString(if (state.session.role == Role.ADMIN) R.string.account_admin_title else R.string.account_buyer_title) +
                ". " + getString(if (state.session.role == Role.ADMIN) R.string.account_admin_intro else R.string.account_buyer_intro) + ". " + state.message
        }
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
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("biometric_action", biometricAction)
        outState.putBoolean("should_offer_biometric", shouldOfferBiometricAfterSignIn)
        super.onSaveInstanceState(outState)
    }
    override fun onStop() {
        reader.stop()
        if (::model.isInitialized && biometric.enabled && !BiometricStoreLock.isSessionUnlocked()) { model.lock(); render(model.state.value) }
        findViewById<EditText>(R.id.account_password).text.clear()
        super.onStop()
    }
    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    private fun openPickupMapDialog() {
        captureDraft()
        val current = model.draft ?: return
        var pickedLat = current.pickupLat ?: -41.4693
        var pickedLng = current.pickupLng ?: -72.9424
        val coordsLabel = TextView(this).apply {
            text = String.format(java.util.Locale.US, "Toca el mapa para mover el punto (%.5f, %.5f)", pickedLat, pickedLng)
            textSize = 14f
            setPadding(0, 0, 0, 16)
        }
        val webView = android.webkit.WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (340 * resources.displayMetrics.density).toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            addJavascriptInterface(object {
                @android.webkit.JavascriptInterface
                fun onPickLocation(lat: Double, lng: Double) {
                    runOnUiThread {
                        pickedLat = lat
                        pickedLng = lng
                        coordsLabel.text = String.format(java.util.Locale.US, "Punto seleccionado: %.5f, %.5f", lat, lng)
                    }
                }
            }, "AndroidMap")
            webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: android.webkit.WebView?, url: String?) {
                    val safeLabel = (current.pickupLabel ?: current.name).replace("'", "\\'")
                    evaluateJavascript("if(window.setPicker){setPicker($pickedLat, $pickedLng, '$safeLabel');}", null)
                }
            }
            loadUrl("file:///android_asset/conectasur_map.html")
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (16 * resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, 0)
            addView(coordsLabel)
            addView(webView)
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Elegir punto de entrega en mapa")
            .setView(container)
            .setPositiveButton("Guardar punto") { _, _ ->
                model.draft?.let { latest ->
                    model.edit(latest.copy(pickupLat = pickedLat, pickupLng = pickedLng))
                    model.message("Punto de entrega seleccionado. Pulsa Guardar cambios para publicar.")
                    render(model.state.value)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .create()
        dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, presentation) }
        dialog.show()
    }

    override fun onDestroy() {
        offerBiometricDialog?.dismiss()
        offerBiometricDialog = null
        reader.close()
        super.onDestroy()
    }
}
