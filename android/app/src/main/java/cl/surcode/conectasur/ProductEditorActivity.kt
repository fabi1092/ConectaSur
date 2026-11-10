package cl.surcode.conectasur

import android.app.AlertDialog
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import android.util.Base64
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
import cl.surcode.conectasur.domain.coerceEditorStep
import cl.surcode.conectasur.domain.countsUnits
import cl.surcode.conectasur.domain.formatDraftReviewSummary
import cl.surcode.conectasur.domain.formatEditorStepHeader
import cl.surcode.conectasur.domain.nextEditorStep
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
    }

    // -------------------------------------------------------------------------
    // A01 y A11: Inicialización del flujo paso a paso y recuperación de borrador
    // -------------------------------------------------------------------------
    override fun onOwnerReady() {
        if (initialized) return
        action("Recuperando tu borrador…") {
            val existing = workspace.draft(shopId)
            val requested = intent.getStringExtra("productId")

            if (existing != null && shouldResumeDraft(existing.optString("id"), requested)) {
                // A11: Retoma el borrador guardado si se cerró la app a mitad del flujo
                draft = existing
            } else if (requested != null) {
                val rows = workspace.cached(shopId).ifEmpty { workspace.sync(shopId).products }
                val item = rows.find { it.base.id == requested }
                    ?: throw IllegalArgumentException("No encontramos ese producto.")
                draft = fromProduct(item)
            } else {
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
            persist()
            deferredPhoto?.let {
                deferredPhoto = null
                encodePhoto(it)
            }
            status("Borrador recuperable. Puedes avanzar o volver sin perder los datos.")
        }
    }

    private fun fromProduct(p: OwnerProduct) = JSONObject()
        .put("id", p.base.id)
        .put("step", 1)
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
    private fun persist() {
        if (initialized && !binding) {
            draft.put("step", step)
            workspace.saveDraft(shopId, draft)
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

        choices(R.id.pe_type, typeNames, types.indexOf(draft.optString("productType")))
        choices(R.id.pe_mode, modes, modeValues.indexOf(StockMode.valueOf(draft.getString("mode"))))
        choices(R.id.pe_soldout, soldOutLabels, soldOutValues.indexOf(draft.getString("soldOut")))

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

        spinner(R.id.pe_type) { i ->
            draft.put("productType", types[i])
            renderAttributes()
            persist()
        }
        spinner(R.id.pe_mode) { i ->
            draft.put("mode", modeValues[i].name)
            renderVariants()
            availability()
            persist()
        }
        spinner(R.id.pe_soldout) { i ->
            draft.put("soldOut", soldOutValues[i])
            persist()
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
                        )
                    } catch (_: Exception) {
                        status("El dictado no está disponible en este teléfono. Puedes usar el micrófono del teclado o escribir.")
                    }
                }
                .show()
        }

        click(R.id.pe_add_variant) {
            if (StockMode.valueOf(draft.getString("mode")) == StockMode.UNIQUE) {
                status("Una pieza única no tiene variantes. Quita las variantes o elige Regular.")
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

        // A01: Navegación paso a paso del flujo guiado
        click(R.id.pe_previous) {
            step = previousEditorStep(step)
            persist()
            showStep()
        }
        click(R.id.pe_next) {
            step = nextEditorStep(step)
            persist()
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
        val box = findViewById<LinearLayout>(R.id.pe_attributes)
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
        val image = findViewById<ImageView>(R.id.pe_photo)
        if (photo.startsWith("data:")) {
            val bytes = Base64.decode(photo.substringAfter(','), Base64.NO_WRAP)
            image.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
        } else {
            PublicImageLoader.load(lifecycleScope, image, photo, BuildConfig.SUPABASE_URL)
        }
        findViewById<TextView>(R.id.pe_photo_status).text =
            if (photo.isBlank()) "Aún no eliges una foto." else "Foto lista. Revisa que el producto se vea completo."
    }

    private fun renderVariants() {
        val box = findViewById<LinearLayout>(R.id.pe_variants)
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
            row.findViewById<TextView>(R.id.pv_photo_status).text =
                if (data.optString("photo").isBlank()) "Usará la foto principal." else "Foto propia lista."
            row.findViewById<Button>(R.id.pv_photo).setOnClickListener {
                photoTarget = data.getString("id")
                gallery.launch("image/*")
            }
            row.findViewById<Button>(R.id.pv_remove).setOnClickListener {
                AlertDialog.Builder(this)
                    .setTitle("Quitar variante")
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
            findViewById<EditText>(R.id.pe_quantity).setText("1")
        }
        findViewById<View>(R.id.pe_quantity).isVisible = tracked && !hasVariants
        findViewById<View>(R.id.pe_quantity_label).isVisible = tracked && !hasVariants
        findViewById<View>(R.id.pe_soldout).isVisible = mode == StockMode.UNITS
        findViewById<View>(R.id.pe_soldout_label).isVisible = mode == StockMode.UNITS
    }

    // -------------------------------------------------------------------------
    // A01: Control de pasos del flujo guiado y resumen previo a publicar
    // -------------------------------------------------------------------------
    private fun showStep() {
        val stepViews = listOf(R.id.pe_step_0, R.id.pe_step_1, R.id.pe_step_2, R.id.pe_step_3)
        for (i in stepViews.indices) {
            findViewById<View>(stepViews[i]).isVisible = (i == step)
        }
        findViewById<TextView>(R.id.pe_step).text = formatEditorStepHeader(step)
        findViewById<View>(R.id.pe_previous).isVisible = step > 0
        findViewById<View>(R.id.pe_next).isVisible = step < 3
        findViewById<View>(R.id.pe_save).isVisible = step == 3
        findViewById<TextView>(R.id.pe_review).text = formatDraftReviewSummary(
            name = draft.optString("name"),
            priceText = draft.optString("price"),
            variantCount = draft.getJSONArray("variants").length()
        )
        (findViewById<View>(R.id.pe_step).parent?.parent as? ScrollView)?.scrollTo(0, 0)
        availability()
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
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    override fun onStop() {
        persist()
        super.onStop()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("photoTarget", photoTarget)
        outState.putString("cameraUri", cameraUri?.toString())
        outState.putString("dictationField", dictationField)
        super.onSaveInstanceState(outState)
    }
}
