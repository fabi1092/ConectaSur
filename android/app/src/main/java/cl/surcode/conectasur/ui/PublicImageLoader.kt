package cl.surcode.conectasur.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import android.widget.ImageView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest

/**
 * Descarga y almacena en caché (memoria y disco) fotos públicas de nuestra instancia;
 * sin tokens y con límite de memoria.
 *
 * El caché en disco permite que la app funcione sin conexión (A17) incluso tras reiniciar
 * el proceso o matar la aplicación en multitarea mientras se está sin red.
 */
object PublicImageLoader {
    private val memoryCache = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    private fun diskFile(context: Context, key: String): File {
        val dir = File(context.cacheDir, "public_images_cache").apply { mkdirs() }
        val hash = MessageDigest.getInstance("SHA-256")
            .digest(key.toByteArray())
            .joinToString("") { "%02x".format(it) }
        return File(dir, "$hash.img")
    }

    fun load(scope: CoroutineScope, image: ImageView, value: String?, backendUrl: String) {
        val url = runCatching { URI(value ?: "") }.getOrNull() ?: return
        val backend = runCatching { URI(backendUrl) }.getOrNull() ?: return
        if (url.scheme != "https" || url.host != backend.host ||
            !url.path.startsWith("/storage/v1/object/public/shop-images/")) return

        val key = value ?: return
        image.tag = key

        // 1. Memoria rápida
        memoryCache[key]?.let {
            image.setImageBitmap(it)
            return
        }

        val appContext = image.context.applicationContext
        scope.launch {
            val bitmap = withContext(Dispatchers.IO) {
                // 2. Disco local (persistencia sin conexión / reinicio en frío A17)
                val file = diskFile(appContext, key)
                if (file.exists() && file.length() > 0) {
                    val diskBitmap = runCatching {
                        val bytes = file.readBytes()
                        decodeSampled(bytes)
                    }.getOrNull()
                    if (diskBitmap != null) {
                        return@withContext diskBitmap
                    }
                }

                // 3. Descarga desde red
                runCatching {
                    val connection = url.toURL().openConnection() as HttpURLConnection
                    try {
                        connection.connectTimeout = 10000
                        connection.readTimeout = 15000
                        connection.instanceFollowRedirects = false
                        connection.setRequestProperty("User-Agent", "ConectaSur-Android/0.3")
                        if (connection.responseCode != 200) return@runCatching null
                        val output = ByteArrayOutputStream()
                        connection.inputStream.use { input ->
                            val chunk = ByteArray(8192)
                            while (true) {
                                val n = input.read(chunk)
                                if (n < 0) break
                                if (output.size() + n > 2097152) return@runCatching null
                                output.write(chunk, 0, n)
                            }
                        }
                        val bytes = output.toByteArray()
                        val downloaded = decodeSampled(bytes)
                        if (downloaded != null) {
                            runCatching {
                                val tmp = File(file.parentFile, "${file.name}.tmp")
                                FileOutputStream(tmp).use { it.write(bytes) }
                                tmp.renameTo(file)
                            }
                        }
                        downloaded
                    } finally {
                        connection.disconnect()
                    }
                }.getOrNull()
            }

            if (bitmap != null) {
                memoryCache.put(key, bitmap)
                if (image.tag == key && image.isAttachedToWindow) {
                    image.setImageBitmap(bitmap)
                }
            }
        }
    }

    private fun decodeSampled(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
        while (maxOf(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 1024) {
            options.inSampleSize *= 2
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }
}
