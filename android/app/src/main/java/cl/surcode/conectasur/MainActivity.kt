package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
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

class MainActivity : ComponentActivity() {
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
    private val accountAccess = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK && result.data?.getBooleanExtra(OPEN_CATALOG, false) == true) {
            shopFilter = null
            navigate(Destination("catalog"))
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
            state.getBundle("scroll")?.let { positions -> positions.keySet().forEach { scrollPositions[it] = positions.getInt(it) } }
        }
        reader = SpeechReader(this) { active -> findViewById<Button>(R.id.read_button).setText(if (active) R.string.stop else R.string.listen) }
        findViewById<Button>(R.id.read_button).setOnClickListener {
            if (reader.active) reader.stop() else reader.read(screenSpeech(), prefs.read().slowVoice)
        }
        findViewById<Button>(R.id.back_button).setOnClickListener { goBack() }
        findViewById<Button>(R.id.large_menu).setOnClickListener { openLargeMenu() }
        findViewById<Button>(R.id.main_account).setOnClickListener { openAccount() }
        findViewById<Button>(R.id.nav_home).setOnClickListener { navigate(Destination("home"), clear = true) }
        findViewById<Button>(R.id.nav_catalog).setOnClickListener { shopFilter = null; navigate(Destination("catalog")); if (current.screen == "catalog") renderProducts() }
        findViewById<Button>(R.id.nav_help).setOnClickListener { navigate(Destination("help")) }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goBack()
        })
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
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { while (isActive) { repository.refresh(); try { RepositoryProvider.syncPendingOwner() } catch(cancelled:CancellationException){throw cancelled} catch(_:Exception){}; delay(15000) } }
                launch { repository.status.collect { if (current.screen == "catalog") bindCatalogStatus() } }
                launch {
                    buyerModel.state.collect { state ->
                        renderAccountAccess(state)
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
    }
    private fun handleOAuthIntent(intent: Intent?) {
        val callback = intent?.data ?: return
        if (callback.scheme != "conectasur" || callback.host != "auth") return
        // No conservar el código en el Intent que Android podría volver a entregar tras una rotación.
        intent.data = null
        buyerModel.completeGoogle(callback.toString())
    }
    override fun onResume() {
        super.onResume()
        if (::buyerModel.isInitialized) buyerModel.refresh()
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
            "settings" -> R.layout.screen_settings
            "help" -> R.layout.screen_help
            "sales" -> R.layout.screen_sales
            else -> R.layout.screen_home
        }
        content.removeAllViews()
        page = layoutInflater.inflate(layout, content, false)
        content.addView(page)
        findViewById<Button>(R.id.back_button).isVisible = current.screen != "home"
        listOf(R.id.nav_home to "home", R.id.nav_catalog to "catalog", R.id.nav_help to "help").forEach { (id, screen) ->
            findViewById<Button>(id).apply {
                isSelected = current.screen == screen || (screen == "catalog" && current.screen == "detail")
                ViewCompat.setStateDescription(this, if (isSelected) "Pantalla actual" else null)
            }
        }
        when (current.screen) {
            "home" -> {
                page.findViewById<Button>(R.id.open_catalog).setOnClickListener { shopFilter = null; navigate(Destination("catalog")) }
                page.findViewById<Button>(R.id.open_store).setOnClickListener { openAccount() }
                page.findViewById<Button>(R.id.open_settings).setOnClickListener { navigate(Destination("settings")) }
                bindHomeBuyerAccess()
            }
            "catalog" -> bindCatalog()
            "detail" -> bindDetail()
            "public_store" -> bindStore()
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
        list.removeAllViews()
        page.findViewById<Button>(R.id.clear_search).isVisible = query.isNotEmpty()
        page.findViewById<TextView>(R.id.results_count).text = resources.getQuantityString(R.plurals.product_count, filtered.size, filtered.size)
        page.findViewById<TextView>(R.id.empty_message).apply {
            isVisible = filtered.isEmpty()
            setText(if (query.isBlank()) R.string.empty_catalog else R.string.empty_search)
        }
        filtered.forEach { product ->
            val item = layoutInflater.inflate(R.layout.item_product, list, false)
            bindPhoto(item.findViewById(R.id.product_photo), product)
            item.findViewById<TextView>(R.id.product_name).text = product.name
            item.findViewById<TextView>(R.id.product_category).text = product.category
            item.findViewById<TextView>(R.id.product_price).apply { text = priceLabel(product.priceClp); contentDescription = spokenPrice(product.priceClp) }
            item.findViewById<TextView>(R.id.product_availability).text = if(product.soldOut) "Agotado" else if(product.onRequest) getString(R.string.on_request) else getString(R.string.available)
            item.findViewById<Button>(R.id.open_product).apply {
                contentDescription = "Ver producto: ${product.name}"
                setOnClickListener { navigate(Destination("detail", product.id)) }
            }
            list.addView(item)
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
        page.findViewById<TextView>(R.id.product_availability).text = if(product.soldOut) "Agotado" else if(product.onRequest) getString(R.string.on_request) else getString(R.string.available)
        page.findViewById<TextView>(R.id.product_description).text = product.description
        page.findViewById<TextView>(R.id.product_attributes).text=product.attributes.entries.joinToString("\n"){"${it.key}: ${it.value}"}
        val variants=page.findViewById<Spinner>(R.id.public_variant)
        variants.isVisible=product.variants.isNotEmpty()
        if(product.variants.isNotEmpty()) {
            variants.adapter=ArrayAdapter(this,android.R.layout.simple_spinner_dropdown_item,product.variants.map{it.label+if(!it.available && !product.onRequest)" · Agotado" else ""})
            variants.setSelection(product.variants.indexOfFirst{it.id==selectedVariants[product.id]}.coerceAtLeast(0))
            variants.onItemSelectedListener=object:AdapterView.OnItemSelectedListener {
                override fun onNothingSelected(parent:AdapterView<*>?){}
                override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){
                    val v=product.variants[position];selectedVariants[product.id]=v.id
                    page.findViewById<TextView>(R.id.product_price).apply{text=priceLabel(v.priceClp);contentDescription=spokenPrice(v.priceClp)}
                    page.findViewById<TextView>(R.id.product_availability).text=if(product.onRequest)"A pedido" else if(product.soldOut||!v.available)"Agotado" else "Disponible"
                    PublicImageLoader.load(lifecycleScope,page.findViewById(R.id.product_photo),v.photo?:product.photo,BuildConfig.SUPABASE_URL)
                }
            }
        }

        page.findViewById<Button>(R.id.view_store).setOnClickListener { navigate(Destination("public_store", product.shopId)) }
        page.findViewById<Button>(R.id.share_product).setOnClickListener {
            val message = "${product.name}\n${spokenPrice(product.priceClp)}\n${product.description}\nDemostración de ConectaSur: datos de ejemplo."
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, message), getString(R.string.share_title)))
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
        outState.putBundle("scroll", Bundle().apply { scrollPositions.forEach { (key, value) -> putInt(key, value) } })
        super.onSaveInstanceState(outState)
    }
    override fun onStop() { reader.stop(); super.onStop() }
    override fun onDestroy() { reader.close(); super.onDestroy() }
}
