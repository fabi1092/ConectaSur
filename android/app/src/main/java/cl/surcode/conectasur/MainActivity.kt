package cl.surcode.conectasur

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.GradientDrawable
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    companion object { const val OPEN_CATALOG = "cl.surcode.conectasur.OPEN_CATALOG" }
    private data class Destination(val screen: String, val productId: String = "") {
        fun encode() = "$screen|${Uri.encode(productId)}"
        companion object {
            fun decode(value: String): Destination {
                val pieces = value.split('|', limit = 2)
                return Destination(pieces[0], Uri.decode(pieces.getOrElse(1) { "" }))
            }
        }
    }
    private val prefs by lazy { AccessibilityPreferences(applicationContext) }
    private val biometric by lazy { BiometricStoreLock(applicationContext) }
    private val repository: CatalogRepository by lazy { RepositoryProvider.catalog(applicationContext) }
    private var products = emptyList<PublicProduct>()
    private var current = Destination("catalog")
    private val history = mutableListOf<Destination>()
    private val scrollPositions = mutableMapOf<String, Int>()
    private var query = ""
    private var shopFilter: String? = null
    private val selectedVariants = mutableMapOf<String,String>()
    private lateinit var buyerModel: BuyerViewModel
    private lateinit var content: FrameLayout
    private lateinit var reader: SpeechReader
    private lateinit var page: View
    private lateinit var entryBiometricPrompt: BiometricPrompt
    private var biometricPrompting = false
    private var bypassEntryLockForPublic = false
    private var lockDialog: AlertDialog? = null
    private var gateDialog: AlertDialog? = null
    private var anonymousNavMode = "allow"
    private var navGateDismissed = false
    private var publicShops = emptyList<Shop>()
    private var publicAssociations = emptyList<PublicAssociation>()
    private var dirTabShops = true
    private var dirQuery = ""
    private var dirTypeFilter = ""
    private var dirSectorFilter = ""
    private var dirAssocFilter = ""
    private var publicFairs = emptyList<PublicFair>()
    private var fairsGpsActive = false
    private var userLat: Double? = null
    private var userLng: Double? = null
    private var fairsPermissionPrompted = false
    private val locationPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (current.screen == "fairs") loadAndRenderFairs(granted)
    }
    private val accountAccess = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK && result.data?.getBooleanExtra(OPEN_CATALOG, false) == true) {
            shopFilter = null
            navigate(Destination("catalog"))
        }
    }
    private val voiceSearchLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val phrase = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (!phrase.isNullOrBlank() && ::page.isInitialized && current.screen == "catalog") {
            query = phrase
            page.findViewById<EditText>(R.id.search_input)?.setText(phrase)
            renderProducts()
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(if (prefs.read().highContrast) R.style.Theme_ConectaSur_HighContrast else R.style.Theme_ConectaSur)
        super.onCreate(savedInstanceState)
        RepositoryProvider.initialize(applicationContext)
        buyerModel = ViewModelProvider(this, object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val demo = getSharedPreferences("buyer_demo", MODE_PRIVATE)
                return BuyerViewModel(if (RepositoryProvider.supabaseReady()) RepositoryProvider.auth() else null,
                    object : DemoBuyerStore {
                        override fun active() = demo.getBoolean("active", false)
                        override fun setActive(active: Boolean) { demo.edit().putBoolean("active", active).commit() }
                    }) as T
            }
        })[BuyerViewModel::class.java]
        buyerModel.start()
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        content = findViewById(R.id.screen_content)
        savedInstanceState?.let { state ->
            current = Destination.decode(state.getString("route") ?: "catalog|")
            history.addAll(state.getStringArrayList("history").orEmpty().map(Destination::decode))
            query = state.getString("query").orEmpty()
            shopFilter = state.getString("shop_filter")
            bypassEntryLockForPublic = state.getBoolean("bypass_entry_lock", false)
            state.getBundle("scroll")?.let { positions -> positions.keySet().forEach { scrollPositions[it] = positions.getInt(it) } }
        }
        entryBiometricPrompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                biometricPrompting = false
                val ok = runCatching { result.cryptoObject?.cipher?.let(biometric::finishUnlock) == true }.getOrDefault(false)
                if (ok) {
                    lockDialog?.dismiss()
                    lockDialog = null
                    content.isVisible = true
                } else {
                    showAppLockDialog("No pudimos verificar tu huella digital. Ingresa con tu contraseña.")
                }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                biometricPrompting = false
                if (!biometric.enabled || BiometricStoreLock.isSessionUnlocked()) {
                    content.isVisible = true
                    return
                }
                val msg = if (errorCode in listOf(
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_CANCELED
                    )
                ) {
                    "Tu cuenta de emprendedora está protegida con huella digital en este teléfono."
                } else {
                    "Huella no disponible en este momento. Puedes ingresar con tu contraseña."
                }
                showAppLockDialog(msg)
            }
        })
        reader = SpeechReader(this) { active -> findViewById<Button>(R.id.read_button).setText(if (active) R.string.stop else R.string.listen) }
        findViewById<Button>(R.id.read_button).setOnClickListener {
            if (reader.active) reader.stop() else reader.read(screenSpeech(), prefs.read().slowVoice)
        }
        findViewById<Button>(R.id.back_button).setOnClickListener { goBack() }
        findViewById<Button>(R.id.large_menu).setOnClickListener { openLargeMenu() }
        findViewById<Button>(R.id.main_account).setOnClickListener { openAccount() }
        findViewById<Button>(R.id.nav_home).setOnClickListener { navigate(Destination("home"), clear = true) }
        findViewById<Button>(R.id.nav_catalog).setOnClickListener {
            if (buyerModel.state.value.session?.role == Role.EMPRENDEDORA) {
                startActivity(Intent(this, ProductManagerActivity::class.java))
            } else {
                shopFilter = null
                navigate(Destination("catalog"))
                if (current.screen == "catalog") renderProducts()
            }
        }
        findViewById<Button>(R.id.nav_stores).setOnClickListener { navigate(Destination("directory")) }
        findViewById<Button>(R.id.nav_fairs).setOnClickListener { navigate(Destination("fairs")) }
        findViewById<Button>(R.id.nav_help).setOnClickListener { navigate(Destination("help")) }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })
        if (intent?.getStringExtra("screen") == "help") {
            navigate(Destination("help"))
        }
        val root = findViewById<View>(R.id.main_scroll)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or
                WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(root)
        products = repository.publicProducts.value
        handleOAuthIntent(intent)
        showScreen()
        if (RepositoryProvider.supabaseReady()) {
            lifecycleScope.launch {
                anonymousNavMode = runCatching { RepositoryProvider.shops().getAnonymousNavigation() }.getOrDefault("allow")
                checkAnonymousGate(buyerModel.state.value)
            }
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { while (isActive) { repository.refresh(); try { RepositoryProvider.syncPendingOwner() } catch(cancelled:CancellationException){throw cancelled} catch(_:Exception){}; delay(15000) } }
                launch { repository.status.collect { if (current.screen == "catalog") bindCatalogStatus() } }
                launch {
                    buyerModel.state.collect { state ->
                        renderAccountAccess(state)
                        checkAnonymousGate(state)
                        if (current.screen == "home") renderHomeBuyerState(state)
                        state.launchUrl?.let { url ->
                            buyerModel.browserLaunched()
                            try { reader.stop(); startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                            catch (_: android.content.ActivityNotFoundException) { buyerModel.browserUnavailable() }
                        }
                    }
                }
                repository.publicProducts.collect {
                    products = it
                    when (current.screen) {
                        "home" -> renderHomeProducts()
                        "catalog" -> renderProducts()
                        "detail" -> bindDetail()
                    }
                }
            }
        }
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOAuthIntent(intent)
        when (intent.getStringExtra("screen")) {
            "help" -> navigate(Destination("help"))
            "home" -> navigate(Destination("home"), clear = true)
        }
    }
    private fun handleOAuthIntent(intent: Intent?) {
        val callback = intent?.data ?: return
        if (callback.scheme != "conectasur" || callback.host != "auth") return
        // No conservar el código en el Intent que Android podría volver a entregar tras una rotación.
        intent.data = null
        buyerModel.completeGoogle(callback.toString())
    }
    override fun onStart() {
        super.onStart()
        checkAppEntryBiometric()
    }

    override fun onResume() {
        super.onResume()
        if (::buyerModel.isInitialized) buyerModel.refresh()
    }

    private fun checkAppEntryBiometric() {
        if (!biometric.enabled || BiometricStoreLock.isSessionUnlocked() || bypassEntryLockForPublic) {
            lockDialog?.dismiss()
            lockDialog = null
            content.isVisible = true
            return
        }
        content.isVisible = false
        if (biometricPrompting || lockDialog?.isShowing == true) return
        launchEntryBiometric()
    }

    private fun launchEntryBiometric() {
        if (biometricPrompting) return
        if (!biometric.available()) {
            showAppLockDialog("La huella no está disponible en este teléfono. Puedes ingresar con tu contraseña.")
            return
        }
        try {
            val cipher = biometric.unlockCipher()
            biometricPrompting = true
            entryBiometricPrompt.authenticate(
                BiometricPrompt.PromptInfo.Builder()
                    .setTitle("Desbloquear ConectaSur")
                    .setSubtitle("Usa tu huella digital para entrar")
                    .setAllowedAuthenticators(BIOMETRIC_STRONG)
                    .setNegativeButtonText("Cancelar")
                    .build(),
                BiometricPrompt.CryptoObject(cipher)
            )
        } catch (_: Exception) {
            biometricPrompting = false
            showAppLockDialog("La huella cambió o no está disponible. Ingresa con tu contraseña para volver a activarla.")
        }
    }

    private fun showAppLockDialog(message: String) {
        if (isFinishing || isDestroyed) return
        lockDialog?.dismiss()
        val dialog = AlertDialog.Builder(this)
            .setTitle("Desbloquear ConectaSur")
            .setMessage(message)
            .setCancelable(false)
            .setPositiveButton("Desbloquear con huella") { _, _ -> launchEntryBiometric() }
            .setNegativeButton("Ingresar con contraseña") { _, _ ->
                biometric.clear()
                content.isVisible = true
                openAccount()
            }
            .setNeutralButton("Ver catálogo público") { _, _ ->
                bypassEntryLockForPublic = true
                content.isVisible = true
            }
            .create()
        dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, prefs.read()) }
        lockDialog = dialog
        dialog.show()
    }
    private fun applyPresentation() {
        val settings = prefs.read()
        applyAccessibility(findViewById(R.id.main_scroll), settings)
        val large = resources.configuration.fontScale * settings.textScale >= 1.7f
        findViewById<View>(R.id.normal_navigation).isVisible = !large
        findViewById<View>(R.id.large_menu).isVisible = large
        findViewById<View>(R.id.read_button).isVisible = !large || current.screen == "home"
        findViewById<View>(R.id.main_account).isVisible = !large && current.screen != "home"
        findViewById<View>(R.id.back_button).isVisible = current.screen !in listOf("home", "catalog")
    }
    private fun openLargeMenu() {
        val menu = layoutInflater.inflate(R.layout.dialog_menu, null)
        val dialog = AlertDialog.Builder(this).setTitle(R.string.menu_title).setView(menu).create()
        listOf(R.id.menu_home to "home", R.id.menu_products to "catalog", R.id.menu_help to "help", R.id.menu_settings to "settings").forEach { (id, route) ->
            menu.findViewById<Button>(id).setOnClickListener { dialog.dismiss(); navigate(Destination(route), clear = route == "home") }
        }
        menu.findViewById<Button>(R.id.menu_read).apply {
            setText(if (reader.active) R.string.stop else R.string.listen)
            setOnClickListener { dialog.dismiss(); if (reader.active) reader.stop() else reader.read(screenSpeech(), prefs.read().slowVoice) }
        }
        menu.findViewById<Button>(R.id.menu_close).setOnClickListener { dialog.dismiss() }
        menu.findViewById<Button>(R.id.menu_account).apply {
            setText(accountLabel(buyerModel.state.value))
            isEnabled = !buyerModel.state.value.busy && !buyerModel.state.value.awaitingGoogle && !buyerModel.state.value.demo
            setOnClickListener { dialog.dismiss(); openAccount() }
        }
        dialog.setOnShowListener { applyAccessibility(dialog.window!!.decorView, prefs.read()) }
        dialog.show()
    }
    private fun saveScroll() {
        if (::page.isInitialized) page.findViewById<ScrollView>(R.id.page_scroll)?.let { scrollPositions[current.encode()] = it.scrollY }
    }
    private fun navigate(destination: Destination, clear: Boolean = false) {
        if (current == destination && !clear) return
        saveScroll()
        reader.stop()
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(content.windowToken, 0)
        if (clear) history.clear() else history.add(current)
        current = destination
        showScreen()
    }
    private fun goBack() {
        if (history.isNotEmpty()) {
            saveScroll(); reader.stop(); current = history.removeAt(history.lastIndex); showScreen()
        } else if (current.screen !in listOf("home", "catalog")) navigate(Destination("catalog"), clear = true) else finish()
    }
    private fun showScreen() {
        val layout = when (current.screen) {
            "catalog" -> R.layout.screen_catalog
            "detail" -> R.layout.screen_detail
            "public_store" -> R.layout.screen_store
            "directory", "association_detail" -> R.layout.screen_directory
            "fairs" -> R.layout.screen_fairs
            "settings" -> R.layout.screen_settings
            "help" -> R.layout.screen_help
            "sales" -> R.layout.screen_sales
            else -> R.layout.screen_home
        }
        content.removeAllViews()
        page = layoutInflater.inflate(layout, content, false)
        content.addView(page)
        findViewById<Button>(R.id.back_button).isVisible = current.screen != "home"
        listOf(
            R.id.nav_home to "home",
            R.id.nav_catalog to "catalog",
            R.id.nav_stores to "directory",
            R.id.nav_fairs to "fairs",
            R.id.nav_help to "help"
        ).forEach { (id, screen) ->
            findViewById<Button>(id).apply {
                isSelected = current.screen == screen ||
                    (screen == "catalog" && current.screen == "detail") ||
                    (screen == "directory" && current.screen in listOf("association_detail", "public_store"))
                ViewCompat.setStateDescription(this, if (isSelected) "Pantalla actual" else null)
            }
        }
        when (current.screen) {
            "home" -> bindHome()
            "catalog" -> bindCatalog()
            "detail" -> bindDetail()
            "public_store" -> bindStore()
            "directory" -> bindDirectory()
            "association_detail" -> bindAssociationDetail()
            "fairs" -> bindFairs()
            "settings" -> bindSettings()
            "help" -> page.findViewById<Button>(R.id.open_settings).setOnClickListener { navigate(Destination("settings")) }
            "sales" -> page.findViewById<Button>(R.id.go_home).setOnClickListener { navigate(Destination("home"), true) }
        }
        renderAccountAccess(buyerModel.state.value)
        applyPresentation()
        val heading = page.findViewById<TextView>(if (current.screen == "home") R.id.welcome_title else R.id.page_title)
        heading?.let { ViewCompat.setAccessibilityHeading(it, true) }
        page.post {
            page.findViewById<ScrollView>(R.id.page_scroll)?.scrollTo(0, scrollPositions[current.encode()] ?: 0)
            heading?.let { ViewCompat.setAccessibilityPaneTitle(content, it.text) }
        }
    }
    private fun openAccount() {
        reader.stop()
        buyerModel.pauseForAccountAccess()
        accountAccess.launch(Intent(this, StoreActivity::class.java))
    }
    private fun accountLabel(state: BuyerState) = when {
        state.session == null -> R.string.account_entry
        state.session.role == Role.EMPRENDEDORA -> R.string.my_store
        else -> R.string.account_home
    }
    private fun renderAccountAccess(state: BuyerState) {
        findViewById<Button>(R.id.main_account).apply {
            setText(accountLabel(state))
            isEnabled = !state.busy && !state.awaitingGoogle && !state.demo
        }
        if (::page.isInitialized) page.findViewById<TextView>(R.id.catalog_mode)?.setText(when {
            state.session == null -> R.string.buyer_public_mode
            state.session.role == Role.COMPRADOR -> R.string.account_buyer_title
            else -> R.string.public_catalog_mode
        })
    }
    private var homeCategory = ""
    private fun bindHome() {
        page.findViewById<Button>(R.id.open_catalog)?.setOnClickListener { shopFilter = null; query = ""; navigate(Destination("catalog")) }
        page.findViewById<Button>(R.id.open_store)?.setOnClickListener { openAccount() }
        page.findViewById<Button>(R.id.open_settings)?.setOnClickListener { navigate(Destination("settings")) }
        val homeSearch = page.findViewById<EditText>(R.id.home_search_input)
        homeSearch?.setText(query)
        homeSearch?.doAfterTextChanged { query = it.toString(); renderHomeProducts() }
        homeSearch?.setOnEditorActionListener { view, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEARCH) {
                (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(view.windowToken, 0)
                view.clearFocus(); true
            } else false
        }
        page.findViewById<Button>(R.id.home_voice_search)?.setOnClickListener {
            try {
                voiceSearchLauncher.launch(
                    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CL")
                        .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L)
                )
            } catch (_: Exception) {
                Toast.makeText(this, "El buscador por voz no está disponible en este teléfono.", Toast.LENGTH_LONG).show()
            }
        }
        val chips = listOf(
            R.id.home_cat_all to "",
            R.id.home_cat_tejidos to "Tejido",
            R.id.home_cat_madera to "Madera",
            R.id.home_cat_reposteria to "Repostería",
            R.id.home_cat_conservas to "Conserva"
        )
        fun refreshChipStyles() {
            val dp = resources.displayMetrics.density
            chips.forEach { (id, cat) ->
                val btn = page.findViewById<Button>(id) ?: return@forEach
                val active = homeCategory == cat
                btn.background = android.graphics.drawable.GradientDrawable().apply {
                    cornerRadius = 999 * dp
                    setColor(if (active) 0xFF1A7B6E.toInt() else 0xFFFFFFFF.toInt())
                    setStroke((1 * dp).toInt(), if (active) 0xFF1A7B6E.toInt() else 0xFFD3DDD9.toInt())
                }
                btn.setTextColor(if (active) 0xFFFFFFFF.toInt() else 0xFF183A34.toInt())
            }
        }
        chips.forEach { (id, cat) ->
            page.findViewById<Button>(id)?.setOnClickListener {
                homeCategory = cat
                refreshChipStyles()
                renderHomeProducts()
            }
        }
        refreshChipStyles()
        bindHomeBuyerAccess()
        renderHomeProducts()
    }
    private fun renderHomeProducts() {
        val list = page.findViewById<LinearLayout>(R.id.home_product_list) ?: return
        val combinedQuery = listOf(homeCategory, query).filter { it.isNotBlank() }.joinToString(" ")
        val filtered = searchProducts(products, combinedQuery)
        page.findViewById<TextView>(R.id.home_products_count)?.text = "${filtered.size} disponibles"
        renderProductGrid(list, filtered.take(8))
    }
    private fun bindHomeBuyerAccess() {
        page.findViewById<Button>(R.id.buyer_demo_login).setOnClickListener { buyerModel.enterDemo() }
        page.findViewById<Button>(R.id.buyer_cancel_login).setOnClickListener { buyerModel.cancelGoogle() }
        page.findViewById<Button>(R.id.buyer_logout).setOnClickListener {
            BiometricStoreLock(applicationContext).clear()
            buyerModel.logout()
        }
        renderHomeBuyerState(buyerModel.state.value)
    }
    private fun renderHomeBuyerState(state: BuyerState) {
        val account = page.findViewById<Button>(R.id.open_store) ?: return
        val buyer = state.session?.role == Role.COMPRADOR
        val isOwner = state.session?.role == Role.EMPRENDEDORA
        page.findViewById<TextView>(R.id.home_mode_badge)?.apply {
            text = if (isOwner) "Modo Emprendedora" else "Modo Comprador"
            setOnClickListener {
                if (isOwner) startActivity(Intent(this@MainActivity, ProductManagerActivity::class.java))
            }
        }
        page.findViewById<View>(R.id.home_owner_actions)?.apply {
            isVisible = isOwner
            if (isOwner) {
                page.findViewById<Button>(R.id.home_owner_manage_products)?.setOnClickListener {
                    startActivity(Intent(this@MainActivity, ProductManagerActivity::class.java))
                }
                page.findViewById<Button>(R.id.home_owner_sales)?.setOnClickListener {
                    startActivity(Intent(this@MainActivity, SalesActivity::class.java))
                }
                page.findViewById<Button>(R.id.home_owner_history)?.setOnClickListener {
                    startActivity(Intent(this@MainActivity, SalesActivity::class.java).putExtra("history", true))
                }
            }
        }
        account.setText(when {
            state.session == null -> R.string.account_entry
            state.session.role == Role.EMPRENDEDORA -> R.string.my_store
            else -> R.string.account_home
        })
        account.isEnabled = !state.busy && !state.awaitingGoogle && !state.demo
        page.findViewById<View>(R.id.buyer_demo_login).apply {
            isVisible = buyerModel.demoAvailable && state.session == null
            isEnabled = !state.busy
        }
        page.findViewById<View>(R.id.buyer_cancel_login).isVisible = state.awaitingGoogle
        page.findViewById<View>(R.id.buyer_logout).isVisible = state.session != null
        page.findViewById<TextView>(R.id.buyer_session_status).apply {
            text = when {
                state.demo -> getString(R.string.buyer_demo_active)
                buyer -> getString(R.string.buyer_session_active, state.session?.email.orEmpty())
                state.session?.role == Role.ADMIN -> getString(R.string.account_role_admin, state.session.email.orEmpty())
                state.session != null -> getString(R.string.account_role_owner, state.session.email.orEmpty())
                state.message.isNotBlank() -> state.message
                state.busy -> getString(R.string.buyer_checking)
                else -> getString(R.string.buyer_visitor)
            }
            isVisible = true
        }
    }
    private fun bindCatalog() {
        bindCatalogStatus()
        val isOwner = buyerModel.state.value.session?.role == Role.EMPRENDEDORA
        page.findViewById<View>(R.id.catalog_owner_banner)?.apply {
            isVisible = isOwner
            page.findViewById<Button>(R.id.catalog_go_to_manager)?.setOnClickListener {
                startActivity(Intent(this@MainActivity, ProductManagerActivity::class.java))
            }
        }
        val search = page.findViewById<EditText>(R.id.search_input)
        search.setText(query)
        search.setSelection(query.length)
        search.doAfterTextChanged { query = it.toString(); renderProducts() }
        search.setOnEditorActionListener { view, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEARCH) {
                (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(view.windowToken, 0)
                view.clearFocus(); true
            } else false
        }
        page.findViewById<Button>(R.id.voice_search)?.setOnClickListener {
            try {
                voiceSearchLauncher.launch(
                    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CL")
                        .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L)
                )
            } catch (_: Exception) {
                Toast.makeText(this, "El buscador por voz no está disponible en este teléfono.", Toast.LENGTH_LONG).show()
            }
        }
        page.findViewById<Button>(R.id.clear_search).setOnClickListener { search.text.clear() }
        renderProducts()
    }
    private fun bindCatalogStatus() {
        page.findViewById<TextView>(R.id.catalog_status)?.apply {
            text = repository.status.value.orEmpty()
            isVisible = !repository.status.value.isNullOrBlank()
        }
    }
    private fun bindPhoto(image: ImageView, product: PublicProduct) {
        image.tag = null
        image.setImageResource(when (product.photo) { "flores" -> R.drawable.flores; "bandejas" -> R.drawable.bandejas; else -> R.drawable.ic_products })
        image.contentDescription = "Fotografía: ${product.name}"
        PublicImageLoader.load(lifecycleScope, image, product.photo, BuildConfig.SUPABASE_URL)
    }
    private fun renderProducts() {
        val filtered = searchProducts(products.filter { shopFilter == null || it.shopId == shopFilter }, query)
        val list = page.findViewById<LinearLayout>(R.id.product_list) ?: return
        page.findViewById<Button>(R.id.clear_search).isVisible = query.isNotEmpty()
        page.findViewById<TextView>(R.id.results_count).text = resources.getQuantityString(R.plurals.product_count, filtered.size, filtered.size)
        page.findViewById<TextView>(R.id.empty_message).apply {
            isVisible = filtered.isEmpty()
            setText(if (query.isBlank()) R.string.empty_catalog else R.string.empty_search)
        }
        renderProductGrid(list, filtered)
    }
    private fun applyStatusBadge(view: TextView, product: PublicProduct) {
        val (label, bgColor, textColor) = when {
            product.soldOut -> Triple("Agotado", 0xFFFDF2F2.toInt(), 0xFF9B2C2C.toInt())
            product.onRequest -> Triple(getString(R.string.on_request), 0xFFFBF3E2.toInt(), 0xFF7A4B0C.toInt())
            else -> Triple(getString(R.string.available), 0xFFE7F4EE.toInt(), 0xFF155C43.toInt())
        }
        view.text = label
        view.setTextColor(textColor)
        val dp = resources.displayMetrics.density
        view.background = GradientDrawable().apply {
            cornerRadius = 999f * dp
            setColor(bgColor)
        }
    }
    private fun renderProductGrid(list: LinearLayout, items: List<PublicProduct>) {
        list.removeAllViews()
        val dp = resources.displayMetrics.density
        val gap = (10 * dp).toInt()
        items.chunked(2).forEach { pair ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                weightSum = 2f
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = gap }
            }
            pair.forEachIndexed { idx, product ->
                val item = layoutInflater.inflate(R.layout.item_product, row, false)
                item.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply {
                    if (idx == 0) marginEnd = gap / 2 else marginStart = gap / 2
                }
                val featuredVariant = product.variants.firstOrNull { it.available || product.onRequest } ?: product.variants.firstOrNull()
                val shownPrice = featuredVariant?.priceClp ?: product.priceClp
                bindPhoto(item.findViewById(R.id.product_photo), product.copy(photo = featuredVariant?.photo ?: product.photo))
                item.findViewById<TextView>(R.id.product_name).text = product.name
                item.findViewById<TextView>(R.id.product_category).text = product.category
                item.findViewById<TextView>(R.id.product_price).apply { text = priceLabel(shownPrice); contentDescription = spokenPrice(shownPrice) }
                applyStatusBadge(item.findViewById(R.id.product_availability), product)
                item.contentDescription = "${product.name}, ${spokenPrice(shownPrice)}"
                item.setOnClickListener { navigate(Destination("detail", product.id)) }
                item.findViewById<Button>(R.id.open_product).apply {
                    contentDescription = "Ver producto: ${product.name}"
                    setOnClickListener { navigate(Destination("detail", product.id)) }
                }
                row.addView(item)
            }
            if (pair.size == 1) {
                row.addView(android.widget.Space(this).apply {
                    layoutParams = LinearLayout.LayoutParams(0, 1, 1f).apply { marginStart = gap / 2 }
                })
            }
            list.addView(row)
        }
        applyAccessibility(list, prefs.read())
    }
    private fun bindDetail() {
        val product = products.find { it.id == current.productId }
        if (product == null) {
            page.findViewById<TextView>(R.id.page_title).setText(R.string.product_missing)
            listOf(R.id.product_photo, R.id.product_category, R.id.product_price, R.id.product_availability,
                R.id.price_note, R.id.about_product, R.id.product_description, R.id.photo_note, R.id.view_store, R.id.share_product)
                .forEach { page.findViewById<View>(it).isVisible = false }
            return
        }
        bindPhoto(page.findViewById(R.id.product_photo), product)
        page.findViewById<TextView>(R.id.page_title).text = product.name
        page.findViewById<TextView>(R.id.product_category).text = product.category
        page.findViewById<TextView>(R.id.product_price).apply { text = priceLabel(product.priceClp); contentDescription = spokenPrice(product.priceClp) }
        applyStatusBadge(page.findViewById(R.id.product_availability), product)
        page.findViewById<TextView>(R.id.product_description).text = product.description
        page.findViewById<TextView>(R.id.product_attributes).text = product.attributes.entries.joinToString("\n") { "${it.key}: ${it.value}" }
        val specsTitle = page.findViewById<View>(R.id.product_attributes_title)
        val specsList = page.findViewById<LinearLayout>(R.id.product_specs_list)
        specsTitle?.isVisible = product.attributes.isNotEmpty()
        specsList?.isVisible = product.attributes.isNotEmpty()
        specsList?.removeAllViews()
        val dp = resources.displayMetrics.density
        product.attributes.entries.forEachIndexed { idx, entry ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding((10 * dp).toInt(), (8 * dp).toInt(), (10 * dp).toInt(), (8 * dp).toInt())
                setBackgroundColor(if (idx % 2 == 0) 0xFFF5F8F6.toInt() else 0xFFFFFFFF.toInt())
            }
            val keyView = TextView(this).apply {
                text = entry.key
                textSize = 14f
                setTextColor(0xFF4A6560.toInt())
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            val valView = TextView(this).apply {
                text = entry.value
                textSize = 14f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(0xFF183A34.toInt())
                gravity = android.view.Gravity.END
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f)
            }
            row.addView(keyView)
            row.addView(valView)
            specsList?.addView(row)
        }

        val variantsSpinner = page.findViewById<Spinner>(R.id.public_variant)
        val variantLabel = page.findViewById<TextView>(R.id.public_variant_label)
        val variantScroll = page.findViewById<View>(R.id.public_variant_scroll)
        val variantChips = page.findViewById<LinearLayout>(R.id.public_variant_chips)
        variantsSpinner.isVisible = false
        variantLabel?.isVisible = product.variants.isNotEmpty()
        variantScroll?.isVisible = product.variants.isNotEmpty()
        variantChips?.removeAllViews()

        if (product.variants.isNotEmpty()) {
            val activeId = selectedVariants[product.id]
                ?: product.variants.firstOrNull { it.available || product.onRequest }?.id
                ?: product.variants.first().id
            selectedVariants[product.id] = activeId

            fun applyVariantSelection(index: Int) {
                val v = product.variants[index]
                selectedVariants[product.id] = v.id
                variantLabel?.text = "Opción elegida: ${v.label}"
                page.findViewById<TextView>(R.id.product_price).apply {
                    text = priceLabel(v.priceClp)
                    contentDescription = spokenPrice(v.priceClp)
                }
                page.findViewById<TextView>(R.id.product_availability).text =
                    if (product.onRequest) "A pedido" else if (product.soldOut || !v.available) "Agotado" else "Disponible"
                val photoView = page.findViewById<ImageView>(R.id.product_photo)
                photoView.tag = null
                PublicImageLoader.load(lifecycleScope, photoView, v.photo ?: product.photo, BuildConfig.SUPABASE_URL)
            }

            fun refreshChipStyles() {
                val chosenId = selectedVariants[product.id]
                for (i in 0 until (variantChips?.childCount ?: 0)) {
                    val chip = variantChips?.getChildAt(i) ?: continue
                    val isSelected = chip.tag == chosenId
                    chip.background = android.graphics.drawable.GradientDrawable().apply {
                        cornerRadius = 12 * dp
                        setColor(if (isSelected) 0xFFEEF6F4.toInt() else 0xFFFFFFFF.toInt())
                        setStroke(
                            ((if (isSelected) 2.5f else 1f) * dp).toInt(),
                            if (isSelected) 0xFF1A7B6E.toInt() else 0xFFD3DDD9.toInt()
                        )
                    }
                    chip.isSelected = isSelected
                }
            }

            product.variants.forEachIndexed { index, v ->
                val chip = LinearLayout(this).apply {
                    tag = v.id
                    orientation = LinearLayout.HORIZONTAL
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    minimumHeight = (56 * dp).toInt()
                    setPadding((10 * dp).toInt(), (8 * dp).toInt(), (12 * dp).toInt(), (8 * dp).toInt())
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginEnd = (10 * dp).toInt() }
                    isClickable = true
                    isFocusable = true
                    val isOut = !v.available && !product.onRequest
                    alpha = if (isOut) 0.65f else 1f
                    contentDescription = "Opción ${v.label}, ${spokenPrice(v.priceClp)}${if (isOut) ", agotado" else ""}"
                }

                val thumb = ImageView(this).apply {
                    layoutParams = LinearLayout.LayoutParams((40 * dp).toInt(), (40 * dp).toInt()).apply {
                        marginEnd = (8 * dp).toInt()
                    }
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    setImageResource(when (v.photo ?: product.photo) {
                        "flores" -> R.drawable.flores
                        "bandejas" -> R.drawable.bandejas
                        else -> R.drawable.ic_products
                    })
                }
                PublicImageLoader.load(lifecycleScope, thumb, v.photo ?: product.photo, BuildConfig.SUPABASE_URL)

                val textCol = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                }
                val titleView = TextView(this).apply {
                    text = v.label
                    textSize = 14f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(0xFF183A34.toInt())
                    maxLines = 1
                }
                val isOut = !v.available && !product.onRequest
                val subView = TextView(this).apply {
                    text = if (isOut) "Agotado" else priceLabel(v.priceClp)
                    textSize = 13f
                    setTextColor(if (isOut) 0xFF9B2C2C.toInt() else 0xFF1A7B6E.toInt())
                }
                textCol.addView(titleView)
                textCol.addView(subView)
                chip.addView(thumb)
                chip.addView(textCol)

                chip.setOnClickListener {
                    applyVariantSelection(index)
                    refreshChipStyles()
                }
                variantChips?.addView(chip)
            }

            val initialIndex = product.variants.indexOfFirst { it.id == activeId }.coerceAtLeast(0)
            applyVariantSelection(initialIndex)
            refreshChipStyles()
        }

        page.findViewById<Button>(R.id.contact_product)?.apply {
            isVisible = RepositoryProvider.supabaseReady() && product.shopId.isNotBlank()
            setOnClickListener {
                startActivity(Intent(this@MainActivity, ShopContactActivity::class.java).putExtra("shop_id", product.shopId))
            }
        }
        page.findViewById<Button>(R.id.view_store).setOnClickListener { navigate(Destination("public_store", product.shopId)) }
        page.findViewById<Button>(R.id.share_product).setOnClickListener {
            val activeVariant = product.variants.find { it.id == selectedVariants[product.id] }
            val activePrice = activeVariant?.priceClp ?: product.priceClp
            val variantSuffix = activeVariant?.let { " (${it.label})" }.orEmpty()
            val url = "${QrShareHelper.publicWebBaseUrl()}/#producto/${Uri.encode(product.id)}"
            val message = "${product.name}$variantSuffix\n${priceLabel(activePrice)}\n${product.description}\n$url"
            QrShareHelper.shareLink(this, getString(R.string.share_title), message)
        }
    }
    private fun bindStore() {
        page.findViewById<TextView>(R.id.page_title).setText(R.string.public_store_title)
        listOf(R.id.change_logo, R.id.remove_logo, R.id.local_logo_note, R.id.store_sales).forEach {
            page.findViewById<View>(it).isVisible = false
        }
        page.findViewById<Button>(R.id.store_catalog).setOnClickListener {
            shopFilter = current.productId; query = ""; navigate(Destination("catalog"))
        }
        if (RepositoryProvider.supabaseReady()) {
            page.findViewById<View>(R.id.store_demo).isVisible = false
            val shopId = current.productId
            lifecycleScope.launch {
                val shop = runCatching { RepositoryProvider.shops().getShop(shopId) }.getOrNull()
                if (shop != null && current.screen == "public_store" && current.productId == shopId) {
                    page.findViewById<TextView>(R.id.store_name).text = shop.name
                    page.findViewById<TextView>(R.id.store_description).text = shop.description
                    page.findViewById<Button>(R.id.store_contact).apply {
                        isVisible = true
                        setOnClickListener { startActivity(Intent(this@MainActivity, ShopContactActivity::class.java).putExtra("shop_id", shop.id)) }
                    }
                    page.findViewById<Button>(R.id.store_share_qr)?.apply {
                        isVisible = true
                        setOnClickListener { QrShareHelper.showQrDialog(this@MainActivity, shop.name, shop.sector.ifBlank { "ConectaSur" }, QrShareHelper.shopUrl(shop.id)) }
                    }
                    val hasPickup = !shop.pickupLabel.isNullOrBlank() || (shop.pickupLat != null && shop.pickupLng != null)
                    page.findViewById<View>(R.id.store_pickup_card)?.isVisible = hasPickup
                    if (hasPickup) {
                        page.findViewById<TextView>(R.id.store_pickup_text)?.text = shop.pickupLabel ?: "Punto de entrega en mapa"
                        page.findViewById<Button>(R.id.store_pickup_directions)?.apply {
                            val lat = shop.pickupLat
                            val lng = shop.pickupLng
                            isVisible = lat != null && lng != null
                            setOnClickListener { if (lat != null && lng != null) openGeoDirections(lat, lng, shop.pickupLabel ?: shop.name) }
                        }
                    }
                    PublicImageLoader.load(lifecycleScope, page.findViewById(R.id.store_logo), shop.logoUrl, BuildConfig.SUPABASE_URL)
                }
            }
        }
    }
    private fun bindSettings() {
        val settings = prefs.read()
        val sizes = page.findViewById<RadioGroup>(R.id.text_size_group)
        sizes.check(when { settings.textScale > 1.2f -> R.id.text_very_large; settings.textScale > 1.05f -> R.id.text_large; else -> R.id.text_normal })
        sizes.setOnCheckedChangeListener { _, id ->
            prefs.save(prefs.read().copy(textScale = when(id) { R.id.text_very_large -> 1.3f; R.id.text_large -> 1.15f; else -> 1f }))
            applyPresentation()
        }
        page.findViewById<Switch>(R.id.big_buttons).apply {
            isChecked = settings.largeButtons
            setOnCheckedChangeListener { _, value -> prefs.save(prefs.read().copy(largeButtons = value)); applyPresentation() }
        }
        page.findViewById<Switch>(R.id.high_contrast).apply {
            isChecked = settings.highContrast
            setOnCheckedChangeListener { _, value -> prefs.save(prefs.read().copy(highContrast = value)); recreate() }
        }
        val speed = page.findViewById<RadioGroup>(R.id.speed_group)
        speed.check(if (settings.slowVoice) R.id.speed_slow else R.id.speed_normal)
        speed.setOnCheckedChangeListener { _, id -> prefs.save(prefs.read().copy(slowVoice = id == R.id.speed_slow)) }
        page.findViewById<Button>(R.id.try_voice).setOnClickListener { reader.read(getString(R.string.voice_example), prefs.read().slowVoice) }
        page.findViewById<Button>(R.id.reset_settings).setOnClickListener { prefs.save(AccessibilitySettings()); recreate() }
    }
    private fun screenSpeech(): String = when(current.screen) {
            "home" -> "ConectaSur. Tu tienda, más cerca. Puedes ver productos sin una cuenta. En Ingresar, usa tu correo y contraseña para abrir tu cuenta de comprador o tu tienda, según tu perfil. También puedes ajustar letras y botones."
        "catalog" -> "Catálogo de productos. Puedes explorar sin iniciar sesión. " + searchProducts(products, query).joinToString(". ") { "${it.name}. ${spokenPrice(it.priceClp)}" }.ifBlank { getString(R.string.empty_search) }
        "detail" -> products.find { it.id == current.productId }?.let { "${it.name}. ${spokenPrice(it.priceClp)}. ${it.description}. Nombre y precio de ejemplo." } ?: getString(R.string.product_missing)
        "public_store" -> "Emprendimiento de ejemplo. Aquí puedes ver el catálogo público."
        "directory" -> "Directorio de tiendas y asociaciones locales."
        "association_detail" -> "Detalle de asociación y emprendimientos asociados."
        "fairs" -> "Próximas ferias en Puerto Montt y Alerce."
        "settings" -> "A tu medida. Cambia las letras a normal, grande o muy grande. Activa botones más grandes o mayor contraste. La lectura puede ser normal o más lenta."
        "sales" -> getString(R.string.sales_pending)
        else -> getString(R.string.help_navigation) + ". " + getString(R.string.help_reading) + ". " + getString(R.string.help_talkback)
    }
    override fun onSaveInstanceState(outState: Bundle) {
        saveScroll()
        outState.putString("route", current.encode())
        outState.putStringArrayList("history", ArrayList(history.map { it.encode() }))
        outState.putString("query", query)
        outState.putString("shop_filter", shopFilter)
        outState.putBoolean("bypass_entry_lock", bypassEntryLockForPublic)
        outState.putBundle("scroll", Bundle().apply { scrollPositions.forEach { (key, value) -> putInt(key, value) } })
        super.onSaveInstanceState(outState)
    }
    override fun onStop() { reader.stop(); super.onStop() }
    private fun checkAnonymousGate(state: BuyerState) {
        if (isFinishing || isDestroyed) return
        if (state.session != null || state.demo) {
            gateDialog?.dismiss()
            gateDialog = null
            return
        }
        if (anonymousNavMode == "allow") return
        if (anonymousNavMode == "invite" && navGateDismissed) return
        if (gateDialog?.isShowing == true) return
        val required = anonymousNavMode == "require"
        val builder = AlertDialog.Builder(this)
            .setTitle(if (required) "Inicia sesión para continuar" else "Bienvenida/o a ConectaSur")
            .setMessage(
                if (required) "La administración configuró ConectaSur para navegar con cuenta. Inicia sesión para explorar tiendas, productos y ferias."
                else "Puedes iniciar sesión con tu cuenta para guardar tu perfil o explorar directamente sin cuenta."
            )
            .setCancelable(!required)
            .setPositiveButton("Iniciar sesión") { _, _ -> openAccount() }
        if (!required) {
            builder.setNegativeButton("Explorar sin cuenta") { _, _ -> navGateDismissed = true }
        }
        gateDialog = builder.create().also { dlg ->
            dlg.setOnShowListener { applyAccessibility(dlg.window!!.decorView, prefs.read()) }
            dlg.show()
        }
    }

    private fun bindDirectory() {
        val tabShops = page.findViewById<Button>(R.id.dir_tab_shops)
        val tabAssoc = page.findViewById<Button>(R.id.dir_tab_associations)
        val filtersPanel = page.findViewById<View>(R.id.dir_filters_panel)
        val searchInput = page.findViewById<EditText>(R.id.dir_search)
        val typeSpinner = page.findViewById<Spinner>(R.id.dir_filter_type)
        val sectorSpinner = page.findViewById<Spinner>(R.id.dir_filter_sector)
        val assocSpinner = page.findViewById<Spinner>(R.id.dir_filter_assoc)

        fun updateTabs() {
            tabShops.setBackgroundResource(if (dirTabShops) R.drawable.button_primary else R.drawable.button_tonal)
            tabShops.setTextColor(if (dirTabShops) 0xFFFFFFFF.toInt() else 0xFF183A34.toInt())
            tabAssoc.setBackgroundResource(if (!dirTabShops) R.drawable.button_primary else R.drawable.button_tonal)
            tabAssoc.setTextColor(if (!dirTabShops) 0xFFFFFFFF.toInt() else 0xFF183A34.toInt())
            filtersPanel.isVisible = dirTabShops
        }

        tabShops.setOnClickListener { dirTabShops = true; updateTabs(); renderDirectoryList() }
        tabAssoc.setOnClickListener { dirTabShops = false; updateTabs(); renderDirectoryList() }
        searchInput.setText(dirQuery)
        searchInput.doAfterTextChanged { dirQuery = it.toString(); renderDirectoryList() }
        updateTabs()

        fun setupSpinner(spinner: Spinner, items: List<String>, selected: String, onSelect: (String) -> Unit) {
            val labels = listOf("Todos") + items
            spinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels)
            val idx = if (selected.isBlank()) 0 else labels.indexOf(selected).coerceAtLeast(0)
            spinner.setSelection(idx, false)
            spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                    onSelect(if (position == 0) "" else labels[position])
                    renderDirectoryList()
                }
                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
        }

        fun bindSpinners() {
            val types = publicShops.mapNotNull { it.entrepreneurType.trim().ifBlank { null } }.distinct().sorted()
            val sectors = publicShops.mapNotNull { it.sector.trim().ifBlank { null } }.distinct().sorted()
            val assocs = publicAssociations.map { it.name }.distinct().sorted()
            setupSpinner(typeSpinner, types, dirTypeFilter) { dirTypeFilter = it }
            setupSpinner(sectorSpinner, sectors, dirSectorFilter) { dirSectorFilter = it }
            setupSpinner(assocSpinner, assocs, dirAssocFilter) { dirAssocFilter = it }
        }

        if (publicShops.isNotEmpty() || publicAssociations.isNotEmpty()) {
            bindSpinners()
            renderDirectoryList()
        }
        if (RepositoryProvider.supabaseReady()) {
            lifecycleScope.launch {
                val shopsResult = runCatching { RepositoryProvider.shops().listPublicShops() }
                val assocResult = runCatching { RepositoryProvider.shops().listPublicAssociations() }
                if (shopsResult.isSuccess) publicShops = shopsResult.getOrDefault(emptyList())
                if (assocResult.isSuccess) publicAssociations = assocResult.getOrDefault(emptyList())
                if (current.screen == "directory") {
                    bindSpinners()
                    renderDirectoryList()
                }
            }
        } else {
            page.findViewById<TextView>(R.id.dir_status).text = "Conecta Supabase para explorar tiendas y asociaciones."
        }
    }

    private fun renderDirectoryList() {
        val list = page.findViewById<LinearLayout>(R.id.dir_list) ?: return
        val status = page.findViewById<TextView>(R.id.dir_status) ?: return
        list.removeAllViews()
        val q = dirQuery.trim().lowercase()
        val dp = resources.displayMetrics.density

        if (dirTabShops) {
            val assocShopIds = if (dirAssocFilter.isBlank()) null else {
                publicAssociations.find { it.name == dirAssocFilter }?.shopIds?.toSet() ?: emptySet()
            }
            val filtered = publicShops.filter { s ->
                val matchesQ = q.isBlank() || s.name.lowercase().contains(q) || s.description.lowercase().contains(q) || s.sector.lowercase().contains(q) || s.entrepreneurType.lowercase().contains(q)
                val matchesType = dirTypeFilter.isBlank() || s.entrepreneurType == dirTypeFilter
                val matchesSector = dirSectorFilter.isBlank() || s.sector == dirSectorFilter
                val matchesAssoc = assocShopIds == null || s.id in assocShopIds
                matchesQ && matchesType && matchesSector && matchesAssoc
            }
            status.text = "${filtered.size} tiendas encontradas"
            filtered.forEach { shop -> list.addView(buildShopDirectoryCard(shop, dp)) }
        } else {
            val filtered = publicAssociations.filter { a ->
                q.isBlank() || a.name.lowercase().contains(q) || a.description.lowercase().contains(q)
            }
            status.text = "${filtered.size} asociaciones encontradas"
            filtered.forEach { assoc ->
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setBackgroundResource(R.drawable.card_surface)
                    val p = (16 * dp).toInt()
                    setPadding(p, p, p, p)
                    layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = (12 * dp).toInt()
                    }
                    isClickable = true
                    isFocusable = true
                    minimumHeight = (56 * dp).toInt()
                    setOnClickListener { navigate(Destination("association_detail", assoc.id)) }
                }
                card.addView(TextView(this).apply {
                    text = assoc.name
                    textSize = 18f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(0xFF183A34.toInt())
                })
                if (assoc.description.isNotBlank()) {
                    card.addView(TextView(this).apply {
                        text = assoc.description
                        textSize = 14f
                        setTextColor(0xFF4A6560.toInt())
                        setPadding(0, (4 * dp).toInt(), 0, 0)
                    })
                }
                card.addView(TextView(this).apply {
                    text = "${assoc.shopIds.size} emprendimientos asociados · Tocar para ver"
                    textSize = 14f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(0xFF1A7B6E.toInt())
                    setPadding(0, (8 * dp).toInt(), 0, 0)
                })
                list.addView(card)
            }
        }
    }

    private fun buildShopDirectoryCard(shop: Shop, dp: Float): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.card_surface)
            val p = (16 * dp).toInt()
            setPadding(p, p, p, p)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = (12 * dp).toInt()
            }
            isClickable = true
            isFocusable = true
            minimumHeight = (56 * dp).toInt()
            setOnClickListener { navigate(Destination("public_store", shop.id)) }
        }
        card.addView(TextView(this).apply {
            text = shop.name.ifBlank { "Tienda local" }
            textSize = 18f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(0xFF183A34.toInt())
        })
        val meta = listOf(shop.entrepreneurType, shop.sector).filter { it.isNotBlank() }.joinToString(" · ")
        if (meta.isNotBlank()) {
            card.addView(TextView(this).apply {
                text = meta
                textSize = 14f
                setTextColor(0xFF1A7B6E.toInt())
                setPadding(0, (4 * dp).toInt(), 0, 0)
            })
        }
        if (shop.description.isNotBlank()) {
            card.addView(TextView(this).apply {
                text = shop.description
                textSize = 14f
                maxLines = 2
                setTextColor(0xFF4A6560.toInt())
                setPadding(0, (4 * dp).toInt(), 0, 0)
            })
        }
        return card
    }

    private fun bindAssociationDetail() {
        page.findViewById<View>(R.id.dir_tab_shops).isVisible = false
        page.findViewById<View>(R.id.dir_tab_associations).isVisible = false
        page.findViewById<View>(R.id.dir_search).isVisible = false
        page.findViewById<View>(R.id.dir_filters_panel).isVisible = false
        val assoc = publicAssociations.find { it.id == current.productId }
        val list = page.findViewById<LinearLayout>(R.id.dir_list)
        val status = page.findViewById<TextView>(R.id.dir_status)
        if (assoc == null) {
            page.findViewById<TextView>(R.id.page_title).text = "Asociación"
            status.text = "Cargando información de la asociación..."
            if (RepositoryProvider.supabaseReady()) {
                lifecycleScope.launch {
                    publicAssociations = runCatching { RepositoryProvider.shops().listPublicAssociations() }.getOrDefault(emptyList())
                    publicShops = runCatching { RepositoryProvider.shops().listPublicShops() }.getOrDefault(emptyList())
                    if (current.screen == "association_detail") bindAssociationDetail()
                }
            }
            return
        }
        page.findViewById<TextView>(R.id.page_title).text = assoc.name
        status.text = assoc.description.ifBlank { "${assoc.shopIds.size} emprendimientos en esta asociación" }
        list.removeAllViews()
        val dp = resources.displayMetrics.density
        list.addView(Button(this).apply {
            text = "Compartir asociación / QR"
            setBackgroundResource(R.drawable.button_tonal)
            setTextColor(0xFF183A34.toInt())
            minimumHeight = (48 * dp).toInt()
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = (16 * dp).toInt()
            }
            setOnClickListener {
                QrShareHelper.showQrDialog(this@MainActivity, assoc.name, "${assoc.shopIds.size} emprendimientos", QrShareHelper.associationUrl(assoc.id))
            }
        })
        val memberShops = publicShops.filter { it.id in assoc.shopIds }
        if (memberShops.isEmpty()) {
            list.addView(TextView(this).apply { text = "No hay tiendas visibles registradas aún."; textSize = 15f })
        } else {
            memberShops.forEach { shop -> list.addView(buildShopDirectoryCard(shop, dp)) }
        }
    }

    private fun bindFairs() {
        page.findViewById<Button>(R.id.fairs_enable_gps).setOnClickListener {
            locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        val hasPerm = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm && !fairsPermissionPrompted) {
            fairsPermissionPrompted = true
            locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        } else {
            loadAndRenderFairs(hasPerm)
        }
    }

    @SuppressLint("MissingPermission")
    private fun loadAndRenderFairs(locationGranted: Boolean) {
        var lat: Double? = null
        var lng: Double? = null
        if (locationGranted &&
            (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED)
        ) {
            val lm = getSystemService(LOCATION_SERVICE) as? LocationManager
            val loc = lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            if (loc != null) {
                lat = loc.latitude
                lng = loc.longitude
            }
        }
        userLat = lat
        userLng = lng
        fairsGpsActive = lat != null && lng != null
        page.findViewById<TextView>(R.id.fairs_gps_badge)?.text = if (fairsGpsActive) "GPS activo" else "Ordenado por fecha"
        page.findViewById<Button>(R.id.fairs_enable_gps)?.isVisible = !locationGranted

        if (!RepositoryProvider.supabaseReady()) {
            page.findViewById<TextView>(R.id.fairs_status)?.text = "Conecta Supabase para consultar ferias."
            return
        }
        lifecycleScope.launch {
            publicFairs = runCatching { RepositoryProvider.shops().listPublicFairs(userLat, userLng) }.getOrDefault(emptyList())
            if (current.screen == "fairs") renderFairsScreen()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun renderFairsScreen() {
        val status = page.findViewById<TextView>(R.id.fairs_status) ?: return
        val list = page.findViewById<LinearLayout>(R.id.fairs_list) ?: return
        val mapView = page.findViewById<WebView>(R.id.fairs_map) ?: return

        status.text = if (publicFairs.isEmpty()) "No hay ferias programadas por ahora." else "${publicFairs.size} ferias próximas"
        val jsonArr = org.json.JSONArray()
        publicFairs.forEach { f ->
            jsonArr.put(org.json.JSONObject().apply {
                put("id", f.id)
                put("name", f.name)
                put("address", f.placeName)
                put("startsAt", f.startsAt)
                put("lat", f.latitude)
                put("lng", f.longitude)
                put("distanceKm", f.distanceKm)
            })
        }
        mapView.settings.javaScriptEnabled = true
        mapView.settings.domStorageEnabled = true
        mapView.addJavascriptInterface(object {
            @JavascriptInterface
            fun openFair(id: String) {
                runOnUiThread {
                    publicFairs.find { it.id == id }?.let { openFairDetailDialog(it) }
                }
            }
        }, "AndroidMap")
        mapView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                val uLat = userLat?.toString() ?: "null"
                val uLng = userLng?.toString() ?: "null"
                view?.evaluateJavascript("if(window.setFairs){setFairs(${org.json.JSONObject.quote(jsonArr.toString())}, $uLat, $uLng);}", null)
            }
        }
        mapView.loadUrl("file:///android_asset/conectasur_map.html")

        list.removeAllViews()
        val dp = resources.displayMetrics.density
        publicFairs.forEach { fair ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundResource(R.drawable.card_surface)
                val p = (16 * dp).toInt()
                setPadding(p, p, p, p)
                layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = (12 * dp).toInt()
                }
                isClickable = true
                isFocusable = true
                minimumHeight = (56 * dp).toInt()
                setOnClickListener { openFairDetailDialog(fair) }
            }
            if (fair.distanceKm != null) {
                card.addView(TextView(this).apply {
                    text = String.format(java.util.Locale.US, "A %.1f km de tu ubicación", fair.distanceKm)
                    textSize = 13f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(0xFF1A7B6E.toInt())
                })
            }
            card.addView(TextView(this).apply {
                text = fair.name
                textSize = 18f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(0xFF183A34.toInt())
                setPadding(0, (2 * dp).toInt(), 0, 0)
            })
            card.addView(TextView(this).apply {
                text = fair.placeName.ifBlank { "Puerto Montt" }
                textSize = 14f
                setTextColor(0xFF4A6560.toInt())
                setPadding(0, (4 * dp).toInt(), 0, 0)
            })
            card.addView(TextView(this).apply {
                text = "Inicio: ${fair.startsAt.take(16).replace('T', ' ')}"
                textSize = 13f
                setTextColor(0xFF4A6560.toInt())
                setPadding(0, (2 * dp).toInt(), 0, 0)
            })
            list.addView(card)
        }
    }

    private fun openFairDetailDialog(fair: PublicFair) {
        val distLine = fair.distanceKm?.let { String.format(java.util.Locale.US, "\nDistancia: %.1f km", it) }.orEmpty()
        val msg = buildString {
            if (fair.description.isNotBlank()) append("${fair.description}\n\n")
            append("Lugar: ${fair.placeName.ifBlank { "Puerto Montt" }}")
            append("\nInicio: ${fair.startsAt.take(16).replace('T', ' ')}")
            append("\nTérmino: ${fair.endsAt.take(16).replace('T', ' ')}")
            append(distLine)
        }
        val dlg = AlertDialog.Builder(this)
            .setTitle(fair.name)
            .setMessage(msg)
            .setPositiveButton("Cómo llegar") { _, _ -> openGeoDirections(fair.latitude, fair.longitude, fair.name) }
            .setNeutralButton("Compartir / QR") { _, _ ->
                QrShareHelper.showQrDialog(this, fair.name, fair.placeName.ifBlank { "Feria ConectaSur" }, QrShareHelper.fairUrl(fair.id))
            }
            .setNegativeButton("Cerrar", null)
            .create()
        dlg.setOnShowListener { applyAccessibility(dlg.window!!.decorView, prefs.read()) }
        dlg.show()
    }

    private fun openGeoDirections(lat: Double, lng: Double, label: String) {
        val uri = Uri.parse("geo:$lat,$lng?q=$lat,$lng(${Uri.encode(label)})")
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: android.content.ActivityNotFoundException) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/search/?api=1&query=$lat,$lng")))
        }
    }

    override fun onDestroy() {
        lockDialog?.dismiss()
        lockDialog = null
        gateDialog?.dismiss()
        gateDialog = null
        reader.close()
        super.onDestroy()
    }
}
