package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.widget.AdapterView
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.isVisible
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.lifecycleScope
import cl.surcode.conectasur.domain.CatalogProduct
import cl.surcode.conectasur.domain.OwnerProduct
import cl.surcode.conectasur.domain.ProductDefaults
import cl.surcode.conectasur.domain.StockMode
import cl.surcode.conectasur.domain.Variant
import cl.surcode.conectasur.domain.addQuickPriceAmount
import cl.surcode.conectasur.domain.adjustQuickQuantity
import cl.surcode.conectasur.domain.coerceEditorStep
import cl.surcode.conectasur.domain.countsUnits
import cl.surcode.conectasur.domain.formatDraftReviewSummary
import cl.surcode.conectasur.domain.formatEditorStepHeader
import cl.surcode.conectasur.domain.formatPriceInWords
import cl.surcode.conectasur.domain.nextEditorStep
import cl.surcode.conectasur.domain.priceLabel
import cl.surcode.conectasur.domain.previousEditorStep
import cl.surcode.conectasur.domain.shouldResumeDraft
import cl.surcode.conectasur.domain.validatedForCatalog
import cl.surcode.conectasur.ui.LogoEncoder
import cl.surcode.conectasur.ui.PublicImageLoader
import cl.surcode.conectasur.ui.applyAccessibility
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

class ProductEditorActivity : OwnerActivity() {
    override val titleText = "Crear o editar producto"

    private var initialized = false
    private var binding = false
    private var shouldPersistDraft = true
    private lateinit var draft: JSONObject
    private var step = 0
    private var photoTarget = "main"
    private var cameraUri: Uri? = null
    private var deferredPhoto: Uri? = null
    private var dictationField = "description"

    private val types = mutableListOf("artesania", "ropa", "alimento", "planta", "hogar", "otro")
    private val typeNames = mutableListOf(
        "Artesanía (incluye flores tejidas y fibras vegetales)",
        "Ropa y tejidos",
        "Alimentos",
        "Planta viva",
        "Hogar y accesorios",
        "Otro producto"
    )
    private val specific = mutableMapOf(
        "artesania" to listOf("Material", "Técnica", "Medidas"),
        "ropa" to listOf("Material", "Cuidados"),
        "alimento" to listOf("Ingredientes", "Alérgenos", "Contenido o porción", "Conservación", "Fecha de elaboración o vencimiento"),
        "planta" to listOf("Especie", "Cuidados", "Tamaño"),
        "hogar" to listOf("Material", "Medidas", "Cuidados"),
        "otro" to listOf("Características")
    )

    private val modes = listOf(
        "Venta regular (control de unidades)",
        "Hecho a pedido (por encargo)",
        "Pieza única (artesanía exclusiva de 1 unidad)",
        "Stock continuo (sin conteo de unidades)"
    )
    private val modeValues = listOf(StockMode.UNITS, StockMode.ON_REQUEST, StockMode.UNIQUE, StockMode.UNLIMITED)

    private val soldOutLabels = listOf(
        "Mostrar como Agotado en la tienda",
        "Ocultar de la tienda",
        "Permitir compras a pedido"
    )
    private val soldOutValues = listOf("SHOW", "HIDE", "ORDER")

    private val gallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) encodePhoto(uri)
    }

    private val camera = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) cameraUri?.let(::encodePhoto)
    }

    private val dictation = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val phrase = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (phrase != null && initialized) {
            draft.put(dictationField, phrase)
            val id = if (dictationField == "name") R.id.pe_name else R.id.pe_description
            findViewById<EditText>(id).setText(phrase)
            persist()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        photoTarget = savedInstanceState?.getString("photoTarget") ?: "main"
        cameraUri = savedInstanceState?.getString("cameraUri")?.let(Uri::parse)
        dictationField = savedInstanceState?.getString("dictationField") ?: "description"

        // Issue 8: Interceptar botón atrás del sistema para retroceder de paso
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                handleBackPress()
            }
        })
    }

    // -------------------------------------------------------------------------
    // A01 y A11: Inicialización del flujo paso a paso y recuperación de borrador
    // -------------------------------------------------------------------------
    override fun onOwnerReady() {
        // Redirigir el botón superior "Volver" para que use la navegación paso a paso
        findViewById<Button>(R.id.owner_back)?.setOnClickListener { handleBackPress() }

        if (initialized) return
        action("Recuperando tu borrador…") {
            val existing = workspace.draft(shopId)
            val requested = intent.getStringExtra("productId")

            if (existing != null && shouldResumeDraft(existing.optString("id"), requested)) {
                // A11: Retoma el borrador guardado si se cerró la app a mitad del flujo
                draft = existing
                shouldPersistDraft = true
            } else if (requested != null) {
                val rows = workspace.cached(shopId).ifEmpty { workspace.sync(shopId).products }
                val item = rows.find { it.base.id == requested }
                    ?: throw IllegalArgumentException("No encontramos ese producto.")
                draft = fromProduct(item)
                shouldPersistDraft = false
            } else {
                shouldPersistDraft = true
                val rawDefaults = workspace.configuration(shopId).getJSONObject("default_products")
                val defaults = ProductDefaults.fromValues(
                    rawDefaults.optString("stockMode"),
                    rawDefaults.optString("soldOut"),
                    rawDefaults.optBoolean("visible", true),
                    rawDefaults.optBoolean("showPrice", true)
                )
                val initial = defaults.newCatalogProduct(UUID.randomUUID().toString(), shopId)
                draft = JSONObject()
                    .put("id", initial.id)
                    .put("step", 0)
                    .put("name", "")
                    .put("description", "")
                    .put("category", initial.category)
                    .put("price", "")
                    .put("productType", initial.productType)
                    .put("attributes", JSONObject())
                    .put("mode", initial.stockMode.name)
                    .put("soldOut", initial.soldOut)
                    .put("visible", initial.visible)
                    .put("showPrice", initial.showPrice)
                    .put("quantity", (initial.quantity ?: 1).toString())
                    .put("photo", "")
                    .put("variants", JSONArray())
            }

            val definitions = workspace.productTypes(shopId)
            for (i in 0 until definitions.length()) {
                val value = definitions.getJSONObject(i)
                val id = value.getString("id")
                if (id !in types) {
                    types.add(id)
                    typeNames.add(value.getString("name"))
                    specific[id] = value.optJSONObject("fields")?.keys()?.asSequence()?.toList().orEmpty()
                }
            }
            val currentType = draft.optString("productType")
            if (currentType !in types) {
                types.add(currentType)
                typeNames.add(currentType)
                specific[currentType] = draft.optJSONObject("attributes")?.keys()?.asSequence()?.toList().orEmpty()
            }

            initialized = true
            step = coerceEditorStep(draft.optInt("step", 0))
            build()
            persist(markEdited = false)
            deferredPhoto?.let {
                deferredPhoto = null
                encodePhoto(it)
            }
            status("Borrador recuperable. Puedes avanzar o volver sin perder los datos.")
        }
    }

    private fun handleBackPress() {
        if (step > 0) {
            step = previousEditorStep(step)
            persist(markEdited = false)
            showStep()
        } else {
            AlertDialog.Builder(this)
                .setTitle("Borrador guardado")
                .setMessage("Tu avance está guardado en este teléfono. Puedes volver más tarde a terminar de publicar tu producto.")
                .setPositiveButton("Seguir editando", null)
                .setNegativeButton("Salir") { _, _ -> finish() }
                .show()
        }
    }

    private fun fromProduct(p: OwnerProduct) = JSONObject()
        .put("id", p.base.id)
        .put("step", 0)
        .put("name", p.base.name)
        .put("description", p.base.description)
        .put("category", p.base.category)
        .put("price", p.base.priceClp.toString())
        .put("productType", p.base.productType.ifBlank { "artesania" })
        .put("attributes", JSONObject(p.base.attributes))
        .put("mode", p.base.stockMode.name)
        .put("quantity", p.base.quantity?.toString() ?: "")
        .put("soldOut", p.base.soldOut)
        .put("visible", p.base.visible)
        .put("showPrice", p.base.showPrice)
        .put("photo", p.base.photo)
        .put("variants", JSONArray().apply {
            p.variants.forEach { v ->
                put(
                    JSONObject()
                        .put("id", v.id)
                        .put("label", v.label)
                        .put("quantity", v.quantity.toString())
                        .put("priceClp", v.priceClp?.toString() ?: "")
                        .put("photo", v.photo ?: "")
                )
            }
        })

    /** A11: Guarda automáticamente el borrador cifrado en cada cambio y al salir de la pantalla. */
    private fun persist(markEdited: Boolean = true) {
        if (initialized && !binding) {
            if (markEdited) shouldPersistDraft = true
            if (shouldPersistDraft) {
                draft.put("step", step)
                workspace.saveDraft(shopId, draft)
            }
        }
    }

    private fun build() {
        binding = true
        screen(R.layout.screen_product_editor)

        fun bind(id: Int, key: String) {
            val input = findViewById<EditText>(id)
            input.setText(draft.optString(key))
            input.doAfterTextChanged {
                if (!binding) {
                    draft.put(key, it.toString())
                    persist()
                }
            }
        }

        bind(R.id.pe_name, "name")
        bind(R.id.pe_description, "description")
        bind(R.id.pe_category, "category")
        bind(R.id.pe_price, "price")
        bind(R.id.pe_quantity, "quantity")

        fun updatePriceWords() {
            findViewById<TextView>(R.id.pe_price_words)?.text = formatPriceInWords(draft.optString("price"))
        }
        updatePriceWords()
        findViewById<EditText>(R.id.pe_price).doAfterTextChanged {
            if (!binding) {
                draft.put("price", it.toString())
                updatePriceWords()
                persist()
            }
        }

        fun addBill(deltaClp: Long) {
            val nextPrice = addQuickPriceAmount(draft.optString("price"), deltaClp)
            draft.put("price", nextPrice)
            findViewById<EditText>(R.id.pe_price).setText(nextPrice)
            updatePriceWords()
            persist()
        }
        click(R.id.pe_add_500) { addBill(500L) }
        click(R.id.pe_add_1000) { addBill(1000L) }
        click(R.id.pe_add_5000) { addBill(5000L) }

        fun adjustStock(delta: Int) {
            val current = draft.optString("quantity").toIntOrNull()
            val next = adjustQuickQuantity(current, delta)
            draft.put("quantity", next.toString())
            findViewById<EditText>(R.id.pe_quantity).setText(next.toString())
            persist()
        }
        click(R.id.pe_qty_minus) { adjustStock(-1) }
        click(R.id.pe_qty_plus) { adjustStock(1) }

        choices(R.id.pe_type, typeNames, types.indexOf(draft.optString("productType")).coerceAtLeast(0))
        choices(R.id.pe_mode, modes, modeValues.indexOf(StockMode.valueOf(draft.getString("mode"))).coerceAtLeast(0))
        choices(R.id.pe_soldout, soldOutLabels, soldOutValues.indexOf(draft.getString("soldOut")).coerceAtLeast(0))

        // A10: Marcar producto disponible o no disponible
        findViewById<CheckBox>(R.id.pe_visible).apply {
            isChecked = draft.getBoolean("visible")
            setOnCheckedChangeListener { _, v ->
                if (!binding) {
                    draft.put("visible", v)
                    persist()
                }
            }
        }
        findViewById<CheckBox>(R.id.pe_show_price).apply {
            isChecked = draft.getBoolean("showPrice")
            setOnCheckedChangeListener { _, v ->
                if (!binding) {
                    draft.put("showPrice", v)
                    persist()
                }
            }
        }

        fun spinner(id: Int, callback: (Int) -> Unit) {
            findViewById<Spinner>(id).onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onNothingSelected(p: AdapterView<*>?) {}
                override fun onItemSelected(p: AdapterView<*>?, v: View?, i: Int, n: Long) {
                    if (!binding) callback(i)
                }
            }
        }

        // Issue 4: Sincronización automática de Rubro y Categoría
        spinner(R.id.pe_type) { i ->
            val chosenType = types[i]
            val typeName = typeNames[i]
            if (draft.optString("productType") != chosenType) {
                draft.put("productType", chosenType)
                val currentCategory = draft.optString("category")
                if (currentCategory.isBlank() || currentCategory in typeNames) {
                    draft.put("category", typeName)
                    findViewById<EditText>(R.id.pe_category)?.setText(typeName)
                }
                renderAttributes()
                persist()
            }
        }

        // Issue 6: Alerta clara si elige Pieza única teniendo variantes
        spinner(R.id.pe_mode) { i ->
            val selectedMode = modeValues[i]
            val variants = draft.getJSONArray("variants")
            if (selectedMode == StockMode.UNIQUE && variants.length() > 0) {
                AlertDialog.Builder(this)
                    .setTitle("Pieza única no admite opciones")
                    .setMessage("Una pieza única es un producto exclusivo de 1 sola unidad sin tallas ni colores. Este producto tiene ${variants.length()} variantes configuradas.\n\n¿Deseas mantener la modalidad 'Venta regular' o quitar las variantes?")
                    .setPositiveButton("Mantener Venta regular") { _, _ ->
                        findViewById<Spinner>(R.id.pe_mode).setSelection(modeValues.indexOf(StockMode.UNITS))
                    }
                    .setNegativeButton("Quitar variantes") { _, _ ->
                        draft.put("variants", JSONArray())
                        draft.put("mode", StockMode.UNIQUE.name)
                        renderVariants()
                        availability()
                        persist()
                    }
                    .setCancelable(false)
                    .show()
            } else {
                if (draft.optString("mode") != selectedMode.name) {
                    draft.put("mode", selectedMode.name)
                    renderVariants()
                    availability()
                    persist()
                }
            }
        }

        spinner(R.id.pe_soldout) { i ->
            if (draft.optString("soldOut") != soldOutValues[i]) {
                draft.put("soldOut", soldOutValues[i])
                persist()
            }
        }

        click(R.id.pe_camera) {
            photoTarget = "main"
            takePhoto()
        }
        click(R.id.pe_gallery) {
            photoTarget = "main"
            gallery.launch("image/*")
        }

        click(R.id.pe_dictate) {
            AlertDialog.Builder(this)
                .setTitle("¿Qué deseas dictar?")
                .setItems(arrayOf("Nombre", "Descripción")) { _, i ->
                    dictationField = if (i == 0) "name" else "description"
                    try {
                        dictation.launch(
                            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CL")
                                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L)
                        )
                    } catch (_: Exception) {
                        status("El dictado no está disponible en este teléfono. Puedes usar el micrófono del teclado o escribir.")
                    }
                }
                .show()
        }

        click(R.id.pe_add_variant) {
            if (StockMode.valueOf(draft.getString("mode")) == StockMode.UNIQUE) {
                AlertDialog.Builder(this)
                    .setTitle("Pieza única no admite opciones")
                    .setMessage("Una pieza única es un producto irrepetible de 1 unidad. Para agregar variantes como tallas o colores, cambia la modalidad a 'Venta regular'.")
                    .setPositiveButton("Cambiar a Venta regular") { _, _ ->
                        draft.put("mode", StockMode.UNITS.name)
                        findViewById<Spinner>(R.id.pe_mode).setSelection(modeValues.indexOf(StockMode.UNITS))
                        availability()
                        persist()
                    }
                    .setNegativeButton("Entendido", null)
                    .show()
                return@click
            }
            val rows = draft.getJSONArray("variants")
            if (rows.length() >= 20) {
                status("Puedes agregar hasta 20 variantes por producto.")
                return@click
            }
            rows.put(
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("label", "")
                    .put("quantity", "1")
                    .put("priceClp", "")
                    .put("photo", "")
            )
            persist()
            renderVariants()
        }

        // A01: Navegación paso a paso del flujo guiado (Issue 7: siguiente arriba, volver abajo)
        click(R.id.pe_previous) {
            step = previousEditorStep(step)
            persist(markEdited = false)
            showStep()
        }
        click(R.id.pe_next) {
            step = nextEditorStep(step)
            persist(markEdited = false)
            showStep()
        }
        click(R.id.pe_save) { save() }

        click(R.id.pe_discard) {
            AlertDialog.Builder(this)
                .setTitle("Descartar este borrador")
                .setMessage("Lo ingresado sin guardar se eliminará de este teléfono. El producto publicado no cambia.")
                .setNegativeButton("Conservar", null)
                .setPositiveButton("Descartar") { _, _ ->
                    initialized = false
                    workspace.discardDraft(shopId)
                    finish()
                }
                .show()
        }

        renderAttributes()
        renderVariants()
        renderPhoto()
        availability()
        binding = false
        showStep()
    }

    private fun renderAttributes() {
        val box = findViewById<LinearLayout>(R.id.pe_attributes) ?: return
        box.removeAllViews()
        val attrs = draft.getJSONObject("attributes")
        val fields = specific[draft.optString("productType")].orEmpty()

        fields.forEach { label ->
            val id = View.generateViewId()
            box.addView(
                TextView(this).apply {
                    text = label
                    textSize = 18f
                    labelFor = id
                }
            )
            box.addView(
                EditText(this).apply {
                    this.id = id
                    hint = label
                    setText(attrs.optString(label))
                    textSize = 18f
                    minHeight = (56 * resources.displayMetrics.density).toInt()
                    isSaveEnabled = false
                    doAfterTextChanged {
                        attrs.put(label, it.toString())
                        persist()
                    }
                }
            )
        }
        applyAccessibility(box, settings)
    }

    private fun takePhoto() {
        try {
            val folder = File(cacheDir, "product_photos").apply { mkdirs() }
            val file = File(folder, "producto-${UUID.randomUUID()}.jpg").apply { createNewFile() }
            cameraUri = FileProvider.getUriForFile(this, "$packageName.files", file)
            camera.launch(requireNotNull(cameraUri))
        } catch (_: Exception) {
            status("No se pudo abrir la cámara. Puedes elegir una foto de la galería.")
        }
    }

    private fun encodePhoto(uri: Uri) {
        if (!initialized) {
            deferredPhoto = uri
            return
        }
        lifecycleScope.launch {
            try {
                val bytes = LogoEncoder.jpeg(contentResolver, uri)
                val encoded = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                if (photoTarget == "main") {
                    draft.put("photo", encoded)
                } else {
                    val rows = draft.getJSONArray("variants")
                    for (i in 0 until rows.length()) {
                        val row = rows.getJSONObject(i)
                        if (row.getString("id") == photoTarget) {
                            row.put("photo", encoded)
                        }
                    }
                }
                persist()
                renderPhoto()
                if (photoTarget != "main") renderVariants()

                if (uri == cameraUri) {
                    val fileName = uri.lastPathSegment?.substringAfterLast('/')
                    if (fileName != null && Regex("producto-[a-fA-F0-9-]+\\.jpg").matches(fileName)) {
                        File(File(cacheDir, "product_photos"), fileName).delete()
                    }
                    cameraUri = null
                }
                status("Foto comprimida y guardada en tu borrador.")
            } catch (e: Exception) {
                status(e.message ?: "No se pudo preparar la foto. Tu borrador se conserva.")
            }
        }
    }

    private fun renderPhoto() {
        val photo = draft.optString("photo")
        val image = findViewById<ImageView>(R.id.pe_photo) ?: return
        if (photo.startsWith("data:")) {
            val bytes = Base64.decode(photo.substringAfter(','), Base64.NO_WRAP)
            image.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
        } else if (photo.isNotBlank()) {
            PublicImageLoader.load(lifecycleScope, image, photo, BuildConfig.SUPABASE_URL)
        } else {
            image.setImageResource(R.drawable.ic_products)
        }
        findViewById<TextView>(R.id.pe_photo_status)?.text =
            if (photo.isBlank()) "Aún no eliges una foto." else "Foto lista. Revisa que el producto se vea completo."
    }

    // Issues 5 & 9: Variantes con vista previa de foto visible y botones de Cámara y Galería (A06)
    private fun renderVariants() {
        val box = findViewById<LinearLayout>(R.id.pe_variants) ?: return
        box.removeAllViews()
        val rows = draft.getJSONArray("variants")
        val tracked = StockMode.valueOf(draft.getString("mode")).countsUnits

        for (i in 0 until rows.length()) {
            val data = rows.getJSONObject(i)
            val row = layoutInflater.inflate(R.layout.item_variant_editor, box, false)

            fun bind(id: Int, key: String) {
                row.findViewById<EditText>(id).apply {
                    setText(data.optString(key))
                    doAfterTextChanged {
                        data.put(key, it.toString())
                        persist()
                    }
                }
            }
            bind(R.id.pv_label, "label")
            bind(R.id.pv_price, "priceClp")
            bind(R.id.pv_quantity, "quantity")
            row.findViewById<View>(R.id.pv_quantity).isVisible = tracked
            row.findViewById<View>(R.id.pv_quantity_label)?.isVisible = tracked

            val photoStr = data.optString("photo")
            val previewImg = row.findViewById<ImageView>(R.id.pv_photo_preview)
            val statusText = row.findViewById<TextView>(R.id.pv_photo_status)

            if (photoStr.isNotBlank()) {
                if (photoStr.startsWith("data:")) {
                    val b = Base64.decode(photoStr.substringAfter(','), Base64.NO_WRAP)
                    previewImg.setImageBitmap(BitmapFactory.decodeByteArray(b, 0, b.size))
                } else {
                    PublicImageLoader.load(lifecycleScope, previewImg, photoStr, BuildConfig.SUPABASE_URL)
                }
                statusText.text = "Foto propia lista."
            } else {
                val mainPhoto = draft.optString("photo")
                if (mainPhoto.isNotBlank()) {
                    if (mainPhoto.startsWith("data:")) {
                        val b = Base64.decode(mainPhoto.substringAfter(','), Base64.NO_WRAP)
                        previewImg.setImageBitmap(BitmapFactory.decodeByteArray(b, 0, b.size))
                    } else {
                        PublicImageLoader.load(lifecycleScope, previewImg, mainPhoto, BuildConfig.SUPABASE_URL)
                    }
                    statusText.text = "Usará la foto principal."
                } else {
                    previewImg.setImageResource(R.drawable.ic_products)
                    statusText.text = "Sin foto (usará la principal)."
                }
            }

            // Issue 9 y A06: Botón de cámara para variantes
            row.findViewById<Button>(R.id.pv_photo_camera).setOnClickListener {
                photoTarget = data.getString("id")
                takePhoto()
            }
            row.findViewById<Button>(R.id.pv_photo_gallery).setOnClickListener {
                photoTarget = data.getString("id")
                gallery.launch("image/*")
            }

            row.findViewById<Button>(R.id.pv_remove).setOnClickListener {
                AlertDialog.Builder(this)
                    .setTitle("Quitar opción")
                    .setMessage("Se quitará esta opción del borrador.")
                    .setNegativeButton("Conservar", null)
                    .setPositiveButton("Quitar") { _, _ ->
                        rows.remove(i)
                        persist()
                        renderVariants()
                    }
                    .show()
            }
            box.addView(row)
            applyAccessibility(row, settings)
        }
    }

    private fun availability() {
        val mode = StockMode.valueOf(draft.getString("mode"))
        val tracked = mode.countsUnits
        val hasVariants = draft.getJSONArray("variants").length() > 0
        if (mode == StockMode.UNIQUE && !hasVariants && (draft.optString("quantity").toIntOrNull() ?: -1) !in 0..1) {
            draft.put("quantity", "1")
            findViewById<EditText>(R.id.pe_quantity)?.setText("1")
        }
        findViewById<View>(R.id.pe_quantity)?.isVisible = tracked && !hasVariants
        findViewById<View>(R.id.pe_quantity_label)?.isVisible = tracked && !hasVariants
        findViewById<View>(R.id.pe_quantity_controls)?.isVisible = mode == StockMode.UNITS && !hasVariants
        findViewById<View>(R.id.pe_soldout)?.isVisible = mode == StockMode.UNITS
        findViewById<View>(R.id.pe_soldout_label)?.isVisible = mode == StockMode.UNITS
    }

    // -------------------------------------------------------------------------
    // A01: Control de los 5 pasos del flujo guiado y resumen previo a publicar
    // -------------------------------------------------------------------------
    private fun showStep() {
        val stepViews = listOf(R.id.pe_step_0, R.id.pe_step_1, R.id.pe_step_2, R.id.pe_step_3, R.id.pe_step_4)
        for (i in stepViews.indices) {
            findViewById<View>(stepViews[i])?.isVisible = (i == step)
        }
        findViewById<TextView>(R.id.pe_step)?.text = formatEditorStepHeader(step)

        // Jerarquía de botones (Issue 7)
        findViewById<View>(R.id.pe_previous)?.isVisible = step > 0
        findViewById<View>(R.id.pe_next)?.isVisible = step < 4
        findViewById<View>(R.id.pe_save)?.isVisible = step == 4

        if (step == 4) {
            renderReviewSummary()
        }

        (findViewById<ScrollView>(R.id.pe_scroll))?.scrollTo(0, 0)
        availability()
    }

    // Issue 10: Resumen interactivo y visual del producto y sus variantes
    private fun renderReviewSummary() {
        val name = draft.optString("name").ifBlank { "Sin nombre" }
        val price = draft.optString("price").toLongOrNull() ?: 0L
        val cat = draft.optString("category").ifBlank { draft.optString("productType") }
        val desc = draft.optString("description").ifBlank { "Sin descripción" }
        val mode = StockMode.valueOf(draft.getString("mode"))
        val visible = draft.getBoolean("visible")

        findViewById<TextView>(R.id.pe_summary_name)?.text = name
        findViewById<TextView>(R.id.pe_summary_category_price)?.text = "$cat · ${priceLabel(price)}"
        findViewById<TextView>(R.id.pe_summary_description)?.text = desc

        val modeText = when (mode) {
            StockMode.UNITS -> "Venta regular (${draft.optString("quantity")} unidades)"
            StockMode.ON_REQUEST -> "Hecho a pedido"
            StockMode.UNIQUE -> "Pieza única"
            StockMode.UNLIMITED -> "Stock continuo"
        }
        val visText = if (visible) "Visible en la tienda" else "Oculto de la tienda"
        findViewById<TextView>(R.id.pe_summary_mode)?.text = "$modeText · $visText"

        val photo = draft.optString("photo")
        val summaryImg = findViewById<ImageView>(R.id.pe_summary_photo)
        if (summaryImg != null) {
            if (photo.startsWith("data:")) {
                val bytes = Base64.decode(photo.substringAfter(','), Base64.NO_WRAP)
                summaryImg.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
            } else if (photo.isNotBlank()) {
                PublicImageLoader.load(lifecycleScope, summaryImg, photo, BuildConfig.SUPABASE_URL)
            } else {
                summaryImg.setImageResource(R.drawable.ic_products)
            }
        }

        val variantsBox = findViewById<LinearLayout>(R.id.pe_summary_variants_box)
        val variantsTitle = findViewById<TextView>(R.id.pe_summary_variants_title)
        variantsBox?.removeAllViews()
        val rows = draft.getJSONArray("variants")

        if (rows.length() == 0) {
            variantsTitle?.isVisible = false
            variantsBox?.isVisible = false
        } else {
            variantsTitle?.isVisible = true
            variantsBox?.isVisible = true
            val density = resources.displayMetrics.density
            for (i in 0 until rows.length()) {
                val v = rows.getJSONObject(i)
                val rowView = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        setMargins(0, (4 * density).toInt(), 0, (8 * density).toInt())
                    }
                    gravity = Gravity.CENTER_VERTICAL
                }

                val thumb = ImageView(this).apply {
                    layoutParams = LinearLayout.LayoutParams((44 * density).toInt(), (44 * density).toInt()).apply {
                        setMargins(0, 0, (12 * density).toInt(), 0)
                    }
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    setBackgroundResource(R.drawable.card_surface)
                    contentDescription = "Foto opción"
                }

                val vPhoto = v.optString("photo").ifBlank { photo }
                if (vPhoto.startsWith("data:")) {
                    val b = Base64.decode(vPhoto.substringAfter(','), Base64.NO_WRAP)
                    thumb.setImageBitmap(BitmapFactory.decodeByteArray(b, 0, b.size))
                } else if (vPhoto.isNotBlank()) {
                    PublicImageLoader.load(lifecycleScope, thumb, vPhoto, BuildConfig.SUPABASE_URL)
                } else {
                    thumb.setImageResource(R.drawable.ic_products)
                }
                rowView.addView(thumb)

                val label = v.optString("label").ifBlank { "Opción ${i + 1}" }
                val vPrice = v.optString("priceClp").toLongOrNull()?.let { priceLabel(it) } ?: priceLabel(price)
                val vQty = if (mode.countsUnits) " · ${v.optString("quantity")} unidades" else ""
                val text = TextView(this).apply {
                    this.text = "$label · $vPrice$vQty"
                    textSize = 15f
                }
                rowView.addView(text)
                variantsBox?.addView(rowView)
            }
        }

        findViewById<TextView>(R.id.pe_review)?.text = formatDraftReviewSummary(
            name = name,
            priceText = draft.optString("price"),
            variantCount = rows.length()
        )
    }

    private fun product(): OwnerProduct {
        val price = draft.optString("price").toLongOrNull()
            ?: throw IllegalArgumentException("Escribe un precio válido en pesos chilenos.")
        val mode = StockMode.valueOf(draft.getString("mode"))
        val rows = draft.getJSONArray("variants")
        val variants = (0 until rows.length()).map { i ->
            val v = rows.getJSONObject(i)
            val amount = if (!mode.countsUnits) {
                0
            } else {
                v.optString("quantity").toIntOrNull()
                    ?: throw IllegalArgumentException("Revisa las unidades de cada variante.")
            }
            val ownPrice = v.optString("priceClp").takeIf { it.isNotBlank() }?.let {
                it.toLongOrNull() ?: throw IllegalArgumentException("Revisa el precio de cada variante.")
            }
            Variant(
                id = v.getString("id"),
                label = v.optString("label"),
                quantity = amount,
                priceClp = ownPrice,
                photo = v.optString("photo").takeIf { it.isNotBlank() }
            )
        }
        val quantity = if (!mode.countsUnits || variants.isNotEmpty()) {
            null
        } else {
            draft.optString("quantity").toIntOrNull()
        }
        val attrs = draft.getJSONObject("attributes")
        val attributes = attrs.keys().asSequence().associateWith { attrs.getString(it) }

        return OwnerProduct(
            CatalogProduct(
                id = draft.getString("id"),
                shopId = shopId,
                name = draft.optString("name"),
                description = draft.optString("description"),
                category = draft.optString("category"),
                priceClp = price,
                showPrice = draft.getBoolean("showPrice"),
                stockMode = mode,
                quantity = quantity,
                visible = draft.getBoolean("visible"),
                photo = draft.optString("photo"),
                productType = draft.optString("productType"),
                attributes = attributes,
                soldOut = draft.getString("soldOut")
            ),
            variants
        ).validatedForCatalog()
    }

    private fun save() {
        val item = try {
            product()
        } catch (e: Exception) {
            status(e.message ?: "Revisa los datos del producto.")
            return
        }
        action("Guardando producto y fotos…") {
            val result = workspace.save(shopId, item)
            workspace.discardDraft(shopId)
            initialized = false
            val msg = if (result.offline) {
                "Producto guardado sin conexión. Se enviará al volver la red."
            } else {
                "Producto guardado en tu catálogo."
            }
            // Issue 11: Se eliminó speakFeedback para no interrumpir con voz inesperada en altavoz
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onStop() {
        persist(markEdited = false)
        super.onStop()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("photoTarget", photoTarget)
        outState.putString("cameraUri", cameraUri?.toString())
        outState.putString("dictationField", dictationField)
        super.onSaveInstanceState(outState)
    }
}
