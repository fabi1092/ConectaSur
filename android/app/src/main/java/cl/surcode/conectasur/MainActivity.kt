package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
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
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import cl.surcode.conectasur.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
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
    private var current = Destination("home")
    private val history = mutableListOf<Destination>()
    private val scrollPositions = mutableMapOf<String, Int>()
    private var query = ""
    private var shopFilter: String? = null
    private lateinit var content: FrameLayout
    private lateinit var reader: SpeechReader
    private lateinit var page: View
    private val pickLogo = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            try {
                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                val previous = prefs.logoUri
                prefs.logoUri = uri.toString()
                if (previous != uri.toString()) releaseLogoGrant(previous)
                if (current.screen == "store") loadLogo()
            } catch (_: SecurityException) { toast(R.string.logo_unavailable) }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(if (prefs.read().highContrast) R.style.Theme_ConectaSur_HighContrast else R.style.Theme_ConectaSur)
        super.onCreate(savedInstanceState)
        RepositoryProvider.initialize(applicationContext)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        content = findViewById(R.id.screen_content)
        savedInstanceState?.let { state ->
            current = Destination.decode(state.getString("route") ?: "home|")
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
        showScreen()
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { while (isActive) { repository.refresh(); delay(15000) } }
                launch { repository.status.collect { if (current.screen == "catalog") bindCatalogStatus() } }
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
    private fun applyPresentation() {
        val settings = prefs.read()
        applyAccessibility(findViewById(R.id.main_scroll), settings)
        val large = resources.configuration.fontScale * settings.textScale >= 1.7f
        findViewById<View>(R.id.normal_navigation).isVisible = !large
        findViewById<View>(R.id.large_menu).isVisible = large
        findViewById<View>(R.id.read_button).isVisible = !large || current.screen == "home"
        findViewById<View>(R.id.back_button).isVisible = current.screen != "home"
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
        } else if (current.screen != "home") navigate(Destination("home"), clear = true) else finish()
    }
    private fun showScreen() {
        val layout = when (current.screen) {
            "catalog" -> R.layout.screen_catalog
            "detail" -> R.layout.screen_detail
            "store", "public_store" -> R.layout.screen_store
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
                page.findViewById<Button>(R.id.open_store).setOnClickListener { navigate(Destination("store")) }
                page.findViewById<Button>(R.id.open_settings).setOnClickListener { navigate(Destination("settings")) }
            }
            "catalog" -> bindCatalog()
            "detail" -> bindDetail()
            "store" -> bindStore(true)
            "public_store" -> bindStore(false)
            "settings" -> bindSettings()
            "help" -> page.findViewById<Button>(R.id.open_settings).setOnClickListener { navigate(Destination("settings")) }
            "sales" -> page.findViewById<Button>(R.id.go_home).setOnClickListener { navigate(Destination("home"), true) }
        }
        applyPresentation()
        val heading = page.findViewById<TextView>(if (current.screen == "home") R.id.welcome_title else R.id.page_title)
        heading?.let { ViewCompat.setAccessibilityHeading(it, true) }
        page.post {
            page.findViewById<ScrollView>(R.id.page_scroll)?.scrollTo(0, scrollPositions[current.encode()] ?: 0)
            heading?.let { ViewCompat.setAccessibilityPaneTitle(content, it.text) }
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
            item.findViewById<TextView>(R.id.product_availability).setText(if (product.onRequest) R.string.on_request else R.string.available)
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
        page.findViewById<TextView>(R.id.product_availability).setText(if (product.onRequest) R.string.on_request else R.string.available)
        page.findViewById<TextView>(R.id.product_description).text = product.description
        page.findViewById<Button>(R.id.view_store).setOnClickListener { navigate(Destination("public_store", product.shopId)) }
        page.findViewById<Button>(R.id.share_product).setOnClickListener {
            val message = "${product.name}\n${spokenPrice(product.priceClp)}\n${product.description}\nDemostración de ConectaSur: datos de ejemplo."
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, message), getString(R.string.share_title)))
        }
    }
    private fun bindStore(editable: Boolean) {
        loadLogo()
        if (!editable) {
            page.findViewById<TextView>(R.id.page_title).setText(R.string.public_store_title)
            listOf(R.id.change_logo, R.id.remove_logo, R.id.local_logo_note, R.id.store_sales).forEach {
                page.findViewById<View>(it).isVisible = false
            }
            page.findViewById<Button>(R.id.store_catalog).setOnClickListener { shopFilter = current.productId; query = ""; navigate(Destination("catalog")) }
            if (RepositoryProvider.supabaseReady()) {
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
            return
        }
        page.findViewById<Button>(R.id.change_logo).setOnClickListener { pickLogo.launch(arrayOf("image/*")) }
        page.findViewById<Button>(R.id.remove_logo).setOnClickListener { clearLogo(); loadLogo() }
        page.findViewById<Button>(R.id.store_catalog).setOnClickListener { query = ""; navigate(Destination("catalog")) }
        page.findViewById<Button>(R.id.store_sales).setOnClickListener { navigate(Destination("sales")) }
    }
    private fun releaseLogoGrant(value: String?) {
        if (value != null) try {
            contentResolver.releasePersistableUriPermission(value.toUri(), Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: SecurityException) { /* An expired grant needs no cleanup. */ }
    }
    private fun clearLogo() {
        val previous = prefs.logoUri
        prefs.logoUri = null
        releaseLogoGrant(previous)
    }
    private fun loadLogo() {
        val image = page.findViewById<ImageView>(R.id.store_logo) ?: return
        image.setImageResource(R.drawable.ic_shop_logo)
        val uri = prefs.logoUri
        page.findViewById<Button>(R.id.remove_logo).isVisible = current.screen == "store" && uri != null
        if (uri == null) return
        lifecycleScope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                try {
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    contentResolver.openInputStream(uri.toUri())?.use { BitmapFactory.decodeStream(it, null, bounds) }
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) null else {
                        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
                        while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1024) options.inSampleSize *= 2
                        contentResolver.openInputStream(uri.toUri())?.use { BitmapFactory.decodeStream(it, null, options) }
                    }
                } catch (_: Exception) { null }
            }
            if (current.screen in listOf("store", "public_store") && prefs.logoUri == uri && image.isAttachedToWindow) {
                if (bitmap != null) image.setImageBitmap(bitmap) else { clearLogo(); loadLogo(); toast(R.string.logo_unavailable) }
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
        "home" -> "ConectaSur. Tu tienda, más cerca. Demostración con datos de ejemplo. Puedes ver productos, entrar a Mi tienda o ajustar letras y botones."
        "catalog" -> "Productos de ejemplo. " + searchProducts(products, query).joinToString(". ") { "${it.name}. ${spokenPrice(it.priceClp)}" }.ifBlank { getString(R.string.empty_search) }
        "detail" -> products.find { it.id == current.productId }?.let { "${it.name}. ${spokenPrice(it.priceClp)}. ${it.description}. Nombre y precio de ejemplo." } ?: getString(R.string.product_missing)
        "public_store" -> "Emprendimiento de ejemplo. Aquí puedes ver el catálogo público."
        "store" -> "Mi tienda. Demostración. Puedes elegir un logo para este teléfono y ver el catálogo de ejemplo."
        "settings" -> "A tu medida. Cambia las letras a normal, grande o muy grande. Activa botones más grandes o mayor contraste. La lectura puede ser normal o más lenta."
        "sales" -> getString(R.string.sales_pending)
        else -> getString(R.string.help_navigation) + ". " + getString(R.string.help_reading) + ". " + getString(R.string.help_talkback)
    }
    private fun toast(message: Int) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
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
