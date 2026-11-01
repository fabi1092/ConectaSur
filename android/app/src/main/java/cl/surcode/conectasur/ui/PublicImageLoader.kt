package cl.surcode.conectasur.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.widget.ImageView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI

/** Descarga solo fotos publicas de nuestra instancia; sin tokens y con limite de memoria. */
object PublicImageLoader {
    private val cache = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    fun load(scope: CoroutineScope, image: ImageView, value: String?, backendUrl: String) {
        val url = runCatching { URI(value ?: "") }.getOrNull() ?: return
        val backend = runCatching { URI(backendUrl) }.getOrNull() ?: return
        if (url.scheme != "https" || url.host != backend.host ||
            !url.path.startsWith("/storage/v1/object/public/shop-images/")) return
        image.tag = value
        cache[value]?.let { image.setImageBitmap(it); return }
        scope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                runCatching {
                    val connection = url.toURL().openConnection() as HttpURLConnection
                    try {
                        connection.connectTimeout = 10000; connection.readTimeout = 15000
                        connection.instanceFollowRedirects = false
                        connection.setRequestProperty("User-Agent", "ConectaSur-Android/0.3")
                        if (connection.responseCode != 200) return@runCatching null
                        val output = ByteArrayOutputStream()
                        connection.inputStream.use { input ->
                            val chunk = ByteArray(8192)
                            while (true) {
                                val n = input.read(chunk); if (n < 0) break
                                if (output.size() + n > 2097152) return@runCatching null
                                output.write(chunk, 0, n)
                            }
                        }
                        val bytes = output.toByteArray()
                        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@runCatching null
                        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
                        while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1024) options.inSampleSize *= 2
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                    } finally { connection.disconnect() }
                }.getOrNull()
            }
            if (bitmap != null) {
                cache.put(value, bitmap)
                if (image.tag == value && image.isAttachedToWindow) image.setImageBitmap(bitmap)
            }
        }
    }
}
