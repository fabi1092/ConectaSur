package cl.surcode.conectasur.ui

import android.app.AlertDialog
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.view.Gravity
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import cl.surcode.conectasur.BuildConfig
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import java.io.File
import java.io.FileOutputStream

object QrShareHelper {
    fun publicWebBaseUrl(): String {
        val projectId = BuildConfig.FIREBASE_PROJECT_ID.trim()
        return if (projectId.isNotBlank()) "https://$projectId.web.app" else "https://conectasur.web.app"
    }

    fun shopUrl(shopId: String) = "${publicWebBaseUrl()}/#tienda/${Uri.encode(shopId)}"
    fun associationUrl(associationId: String) = "${publicWebBaseUrl()}/#asociacion/${Uri.encode(associationId)}"
    fun fairUrl(fairId: String) = "${publicWebBaseUrl()}/#feria/${Uri.encode(fairId)}"

    fun shareLink(context: Context, title: String, message: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, message)
        }
        context.startActivity(Intent.createChooser(intent, "Compartir"))
    }

    fun generateQrBitmap(content: String, sizePx: Int = 512): Bitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 2)
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bmp.setPixel(x, y, if (matrix[x, y]) 0xFF183A34.toInt() else Color.WHITE)
            }
        }
        return bmp
    }

    fun showQrDialog(context: Context, title: String, subtitle: String, url: String) {
        val bitmap = generateQrBitmap(url, 560)
        val dp = context.resources.displayMetrics.density
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding((20 * dp).toInt(), (16 * dp).toInt(), (20 * dp).toInt(), (16 * dp).toInt())
        }
        root.addView(TextView(context).apply {
            text = subtitle
            textSize = 15f
            setTextColor(0xFF4A6560.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (12 * dp).toInt())
        })
        root.addView(ImageView(context).apply {
            setImageBitmap(bitmap)
            layoutParams = LinearLayout.LayoutParams((240 * dp).toInt(), (240 * dp).toInt()).apply {
                bottomMargin = (14 * dp).toInt()
            }
            contentDescription = "Código QR para $title"
        })
        root.addView(TextView(context).apply {
            text = url
            textSize = 12f
            setTextColor(0xFF4A6560.toInt())
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (12 * dp).toInt())
        })

        fun makeBtn(label: String, bgColor: Int, textColor: Int) = Button(context).apply {
            text = label
            textSize = 15f
            isAllCaps = false
            minimumHeight = (48 * dp).toInt()
            setBackgroundColor(bgColor)
            setTextColor(textColor)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * dp).toInt() }
        }

        val shareQrBtn = makeBtn("Compartir imagen QR", 0xFF1A7B6E.toInt(), Color.WHITE).apply {
            setOnClickListener { shareQrImage(context, title, bitmap) }
        }
        val saveQrBtn = makeBtn("Guardar QR en galería", 0xFFEEF6F4.toInt(), 0xFF155C43.toInt()).apply {
            setOnClickListener { saveQrToGallery(context, title, bitmap) }
        }
        val shareUrlBtn = makeBtn("Compartir enlace web", 0xFFFFFFFF.toInt(), 0xFF183A34.toInt()).apply {
            setOnClickListener { shareLink(context, title, "$title\n$url") }
        }
        root.addView(shareQrBtn)
        root.addView(saveQrBtn)
        root.addView(shareUrlBtn)

        AlertDialog.Builder(context)
            .setTitle("Código QR: $title")
            .setView(root)
            .setNegativeButton("Cerrar", null)
            .show()
    }

    private fun shareQrImage(context: Context, title: String, bitmap: Bitmap) {
        val dir = File(context.cacheDir, "qr_codes").apply { mkdirs() }
        val file = File(dir, "conectasur_qr_${System.currentTimeMillis()}.png")
        FileOutputStream(file).use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "QR ConectaSur: $title")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Compartir código QR"))
    }

    private fun saveQrToGallery(context: Context, title: String, bitmap: Bitmap) {
        val safeName = title.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').ifBlank { "qr" }
        val fileName = "conectasur-$safeName-${System.currentTimeMillis()}.png"
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/ConectaSur")
            }
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        if (uri == null) {
            Toast.makeText(context, "No pudimos guardar el QR en la galería.", Toast.LENGTH_SHORT).show()
            return
        }
        resolver.openOutputStream(uri)?.use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) }
        Toast.makeText(context, "Código QR guardado en Imágenes/ConectaSur.", Toast.LENGTH_LONG).show()
    }
}

