package cl.surcode.conectasur

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import android.text.Editable
import android.text.TextWatcher
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.setPadding
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID

/**
 * Espacio de trabajo de productos de Dan. Los productos y borradores de demostracion
 * se conservan localmente para que cerrar la app no interrumpa la edicion.
 */
class ProductManagerActivity : ComponentActivity() {
    data class Item(
        val id: String, var name: String, var category: String, var description: String,
        var price: Long, var type: String, var sizes: String, var colors: String,
        var photo: String, var published: Boolean
    )
    private val prefs by lazy { getSharedPreferences("conectasur_products_workspace", MODE_PRIVATE) }
    private val items = mutableListOf<Item>()
    private lateinit var list: LinearLayout
    private lateinit var summary: TextView
    private var pendingPhoto = ""
    private var editingId: String? = null
    private val gallery = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) try {
            contentResolver.openInputStream(uri)?.use { stream ->
                val bitmap = BitmapFactory.decodeStream(stream)
                pendingPhoto = compress(bitmap)
                if (editingId == null) {
                    val draft = runCatching { JSONObject(prefs.getString("editor_recovery", "{}")) }.getOrDefault(JSONObject())
                    prefs.edit().putString("editor_recovery", draft.put("photo", pendingPhoto).toString()).apply()
                }
            }
            Toast.makeText(this, if (pendingPhoto.isNotEmpty()) "Fotografía optimizada correctamente" else "No se pudo cargar la fotografía", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) { Toast.makeText(this, "No se pudo procesar la imagen", Toast.LENGTH_LONG).show() }
    }
    private val camera = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) {
            pendingPhoto = compress(bitmap)
            if (editingId == null) {
                val draft = runCatching { JSONObject(prefs.getString("editor_recovery", "{}")) }.getOrDefault(JSONObject())
                prefs.edit().putString("editor_recovery", draft.put("photo", pendingPhoto).toString()).apply()
            }
            Toast.makeText(this, "Fotografía tomada y comprimida", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        loadItems()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFFFAF7F2.toInt())
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22))
            setBackgroundColor(0xFF1A7B6E.toInt())
        }
        val back = TextView(this).apply {
            text = "‹  Volver a Mi tienda"; textSize = 16f; setTextColor(-1)
            setPadding(0, dp(4), 0, dp(12)); setOnClickListener { finish() }
        }
        header.addView(back)
        header.addView(TextView(this).apply {
            text = "Mis productos"; textSize = 29f; setTextColor(-1); setTypeface(null, 1)
        })
        header.addView(TextView(this).apply {
            text = "Administra tu catálogo desde un solo lugar"; textSize = 15f; setTextColor(0xFFE0F2ED.toInt())
            setPadding(0, dp(5), 0, dp(4))
        })
        root.addView(header)
        val scroll = ScrollView(this)
        val body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18)) }
        summary = TextView(this).apply { textSize = 15f; setTextColor(0xFF52665F.toInt()); setPadding(0, dp(10), 0, dp(14)) }
        body.addView(summary)
        val add = Button(this).apply {
            text = "+  Agregar producto"; isAllCaps = false; textSize = 17f
            setTextColor(-1); setBackgroundColor(0xFF1A7B6E.toInt())
            setOnClickListener { openEditor(null) }
        }
        body.addView(add, matchWrap())
        body.addView(TextView(this).apply {
            text = "Tu catálogo"; textSize = 21f; setTypeface(null, 1); setTextColor(0xFF183A34.toInt())
            setPadding(0, dp(20), 0, dp(8))
        })
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        body.addView(list)
        body.addView(TextView(this).apply {
            text = "Los borradores quedan guardados en este dispositivo. Puedes volver a editarlos cuando quieras."
            textSize = 13f; setTextColor(0xFF687A73.toInt()); setPadding(0, dp(16), 0, dp(24))
        })
        scroll.addView(body)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        render()
    }

    private fun openEditor(item: Item?) {
        editingId = item?.id
        val recovery = if (item == null) runCatching { JSONObject(prefs.getString("editor_recovery", "{}")) }.getOrDefault(JSONObject()) else JSONObject()
        pendingPhoto = item?.photo ?: recovery.optString("photo", "")
        val form = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18)) }
        val photoLabel = TextView(this).apply {
            text = if (pendingPhoto.isEmpty()) "Sin fotografía seleccionada" else "✓ Fotografía lista"
            textSize = 14f; setTextColor(0xFF1A7B6E.toInt()); setPadding(0, 0, 0, dp(8))
        }
        val photoButtons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val galleryButton = Button(this).apply { text = "Galería"; isAllCaps = false; setOnClickListener { gallery.launch("image/*"); photoLabel.text = "Selecciona una imagen de la galería" } }
        val cameraButton = Button(this).apply { text = "Cámara"; isAllCaps = false; setOnClickListener { camera.launch(null); photoLabel.text = "Abriendo cámara…" } }
        photoButtons.addView(galleryButton, LinearLayout.LayoutParams(0, -2, 1f))
        photoButtons.addView(cameraButton, LinearLayout.LayoutParams(0, -2, 1f))
        form.addView(photoLabel); form.addView(photoButtons)
        fun field(label: String, value: String = "", hint: String = label, input: Int = 1): EditText {
            form.addView(TextView(this).apply { text = label; textSize = 14f; setTextColor(0xFF52665F.toInt()); setPadding(0, dp(10), 0, dp(3)) })
            return EditText(this).apply {
                setSingleLine(input == 1); this.inputType = input; setText(value); this.hint = hint
                textSize = 16f; setPadding(dp(12), dp(9), dp(12), dp(9))
                background = getDrawable(android.R.drawable.edit_text)
                form.addView(this, matchWrap())
            }
        }
        val name = field("Nombre del producto", item?.name ?: recovery.optString("name"), "Ej. Polerón tejido")
        val category = field("Categoría", item?.category ?: recovery.optString("category"), "Ej. Ropa, artesanía, decoración")
        val description = field("Descripción", item?.description ?: recovery.optString("description"), "Describe tu producto", android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE)
        val price = field("Precio (CLP)", item?.price?.toString() ?: recovery.optString("price"), "Ej. 12000", 2)
        val type = field("Tipo de producto", item?.type ?: recovery.optString("type"), "Ej. ropa, accesorio, alimento")
        val sizes = field("Tallas / medidas", item?.sizes ?: recovery.optString("sizes"), "Ej. S, M, L o 20 x 30 cm")
        val colors = field("Colores disponibles", item?.colors ?: recovery.optString("colors"), "Ej. negro, azul, blanco")
        val publish = Switch(this).apply {
            text = "Publicar en el catálogo"; textSize = 16f; isChecked = item?.published ?: recovery.optBoolean("published", true)
            setTextColor(0xFF183A34.toInt()); setPadding(0, dp(14), 0, dp(8))
        }
        form.addView(publish)
        fun saveRecovery() {
            if (item != null) return
            prefs.edit().putString("editor_recovery", JSONObject().put("name", name.text.toString())
                .put("category", category.text.toString()).put("description", description.text.toString())
                .put("price", price.text.toString()).put("type", type.text.toString()).put("sizes", sizes.text.toString())
                .put("colors", colors.text.toString()).put("photo", pendingPhoto).put("published", publish.isChecked).toString()).apply()
        }
        listOf(name, category, description, price, type, sizes, colors).forEach { input ->
            input.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { saveRecovery() }
                override fun afterTextChanged(s: Editable?) {}
            })
        }
        publish.setOnCheckedChangeListener { _, _ -> saveRecovery() }
        val dialog = AlertDialog.Builder(this).setTitle(if (item == null) "Nuevo producto" else "Editar producto")
            .setView(ScrollView(this).apply { addView(form) })
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Guardar", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val parsedPrice = price.text.toString().trim().toLongOrNull()
                if (name.text.isNullOrBlank() || parsedPrice == null || parsedPrice < 0) {
                    Toast.makeText(this, "Ingresa un nombre y un precio válido", Toast.LENGTH_LONG).show()
                    return@setOnClickListener
                }
                val saved = Item(item?.id ?: UUID.randomUUID().toString(), name.text.toString().trim(),
                    category.text.toString().trim().ifBlank { "General" }, description.text.toString().trim(),
                    parsedPrice, type.text.toString().trim(), sizes.text.toString().trim(), colors.text.toString().trim(),
                    pendingPhoto, publish.isChecked)
                if (item == null) items.add(saved) else {
                    val index = items.indexOfFirst { it.id == item.id }
                    if (index >= 0) items[index] = saved
                }
                saveItems(); prefs.edit().remove("editor_recovery").apply(); render(); dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun render() {
        list.removeAllViews()
        val published = items.count { it.published }
        val drafts = items.size - published
        summary.text = "${items.size} productos  •  $published publicados  •  $drafts borradores"
        if (items.isEmpty()) {
            list.addView(TextView(this).apply {
                text = "Todavía no tienes productos. Pulsa “Agregar producto” para crear el primero."
                textSize = 16f; setTextColor(0xFF52665F.toInt()); setPadding(dp(18), dp(24), dp(18), dp(24))
                setBackgroundColor(-1)
            })
        }
        items.forEach { item ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; setPadding(dp(16))
                setBackgroundColor(-1)
            }
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            if (item.photo.isNotEmpty()) {
                try {
                    val bytes = Base64.decode(item.photo, Base64.DEFAULT)
                    val image = ImageView(this).apply {
                        setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
                        scaleType = ImageView.ScaleType.CENTER_CROP
                    }
                    row.addView(image, LinearLayout.LayoutParams(dp(76), dp(76)))
                } catch (_: Exception) {}
            }
            val details = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12), 0, 0, 0) }
            details.addView(TextView(this).apply { text = item.name; textSize = 18f; setTypeface(null, 1); setTextColor(0xFF183A34.toInt()) })
            details.addView(TextView(this).apply { text = item.category + "  •  $" + item.price; textSize = 14f; setTextColor(0xFF52665F.toInt()) })
            details.addView(TextView(this).apply {
                text = if (item.published) "● Publicado" else "◷ Borrador"
                textSize = 13f; setTextColor(if (item.published) 0xFF1A7B6E.toInt() else 0xFF98712A.toInt())
            })
            row.addView(details, LinearLayout.LayoutParams(0, -2, 1f))
            card.addView(row)
            val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END }
            val edit = Button(this).apply { text = "Editar"; isAllCaps = false; setOnClickListener { openEditor(item) } }
            val visibility = Button(this).apply {
                text = if (item.published) "Pasar a borrador" else "Publicar"; isAllCaps = false
                setOnClickListener { item.published = !item.published; saveItems(); render() }
            }
            val delete = Button(this).apply {
                text = "Eliminar"; isAllCaps = false; setOnClickListener {
                    AlertDialog.Builder(this@ProductManagerActivity).setTitle("Eliminar producto")
                        .setMessage("¿Quieres eliminar “${item.name}”?")
                        .setNegativeButton("Cancelar", null).setPositiveButton("Eliminar") { _, _ ->
                            items.removeAll { it.id == item.id }; saveItems(); render()
                        }.show()
                }
            }
            actions.addView(edit); actions.addView(visibility); actions.addView(delete)
            card.addView(actions)
            val outer = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, dp(12))
                addView(card, matchWrap())
            }
            list.addView(outer)
        }
    }

    private fun compress(bitmap: Bitmap): String {
        val max = 1280
        val scale = minOf(1f, max.toFloat() / maxOf(bitmap.width, bitmap.height))
        val resized = if (scale < 1f) Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true) else bitmap
        val out = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, 78, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
    private fun saveItems() {
        val array = JSONArray()
        items.forEach { p -> array.put(JSONObject().put("id",p.id).put("name",p.name).put("category",p.category)
            .put("description",p.description).put("price",p.price).put("type",p.type).put("sizes",p.sizes)
            .put("colors",p.colors).put("photo",p.photo).put("published",p.published)) }
        prefs.edit().putString("items", array.toString()).apply()
    }
    private fun loadItems() {
        items.clear()
        try {
            val array = JSONArray(prefs.getString("items", "[]"))
            for (i in 0 until array.length()) {
                val p = array.getJSONObject(i)
                items.add(Item(p.getString("id"),p.getString("name"),p.getString("category"),p.optString("description"),
                    p.optLong("price"),p.optString("type"),p.optString("sizes"),p.optString("colors"),p.optString("photo"),p.optBoolean("published")))
            }
        } catch (_: Exception) { items.clear() }
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun matchWrap() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
}
