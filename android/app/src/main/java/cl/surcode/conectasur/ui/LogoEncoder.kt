package cl.surcode.conectasur.ui

import android.content.ContentResolver
import android.graphics.BitmapFactory
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

object LogoEncoder {
    /** Lee con límite, reduce dimensiones y convierte a JPEG sin conservar metadatos de la imagen. */
    suspend fun jpeg(resolver: ContentResolver, uri: Uri): ByteArray = withContext(Dispatchers.IO) {
        val bytes = resolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                require(output.size() + n <= 20 * 1024 * 1024) { "Elige una imagen de hasta 20 MiB." }
                output.write(buffer, 0, n)
            }
            output.toByteArray()
        } ?: throw IllegalArgumentException("No pudimos abrir la imagen.")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outWidth > 0 && bounds.outHeight > 0) { "El archivo no es una imagen compatible." }
        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
        while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1024) options.inSampleSize *= 2
        val bitmap = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) { "No pudimos abrir la imagen." }
        // JPEG no tiene canal alfa: usar blanco para logos PNG transparentes.
        val flattened = android.graphics.Bitmap.createBitmap(bitmap.width, bitmap.height, android.graphics.Bitmap.Config.ARGB_8888)
        android.graphics.Canvas(flattened).apply { drawColor(android.graphics.Color.WHITE); drawBitmap(bitmap, 0f, 0f, null) }
        try {
            val output = ByteArrayOutputStream()
            check(flattened.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, output))
            output.toByteArray().also { require(it.size <= 2097152) { "El logo debe pesar hasta 2 MiB." } }
        } finally { flattened.recycle(); bitmap.recycle() }
    }
}
