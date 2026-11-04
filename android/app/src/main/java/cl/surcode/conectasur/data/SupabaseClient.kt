package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.util.UUID

class BackendException(val status: Int, message: String) : Exception(message)
class PendingProductException : IOException("Sin conexion: guardamos un borrador y se enviara al recuperar la conexion con esta cuenta.")

/** Cliente REST de Supabase: Auth, PostgREST/RPC y Storage. Solo utiliza anon y JWT de usuario. */
class SupabaseClient(val url: String, private val anonKey: String, val store: SecureBackendStore) {
    private val refreshLock = Mutex()
    internal val productWriteLock = Mutex()
    init { require(URI(url).scheme == "https") { "Supabase requiere HTTPS" }; require(anonKey.isNotBlank()) }
    fun storedSession(): JSONObject? = store.read("auth")?.let { runCatching { JSONObject(it) }.getOrNull() }
    fun uid(): String? = storedSession()?.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() }
    fun cachedProfile(): Session? = storedSession()?.optJSONObject("profile")?.toSession()
    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null, authenticated: Boolean = false, prefer: String? = null): Any {
        val token = if (authenticated) accessToken() else anonKey
        return try { send(path, method, body?.toString()?.toByteArray(Charsets.UTF_8), "application/json", token, prefer) }
        catch (e: BackendException) {
            if (e.status != 401 || !authenticated) throw e
            val renewed = accessToken(force = true)
            send(path, method, body?.toString()?.toByteArray(Charsets.UTF_8), "application/json", renewed, prefer)
        }
    }
    private suspend fun accessToken(force: Boolean = false): String = refreshLock.withLock {
        val previous = storedSession() ?: throw BackendException(401, "Inicia sesion para continuar")
        if (!force && previous.optLong("expires_at") > System.currentTimeMillis() / 1000 + 60) return@withLock previous.getString("access_token")
        try {
            val result = send("/auth/v1/token?grant_type=refresh_token", "POST",
                JSONObject().put("refresh_token", previous.getString("refresh_token")).toString().toByteArray(Charsets.UTF_8), "application/json", anonKey) as JSONObject
            previous.optJSONObject("profile")?.let { result.put("profile", it) }
            if (storedSession()?.optString("refresh_token") != previous.optString("refresh_token")) throw BackendException(401, "La sesion cambio")
            if (!result.has("expires_at")) result.put("expires_at", System.currentTimeMillis() / 1000 + result.getLong("expires_in"))
            store.write("auth", result.toString()); result.getString("access_token")
        } catch (e: BackendException) { if (e.status in 400..403 && storedSession()?.optString("refresh_token") == previous.optString("refresh_token")) clearSession(); throw e }
    }
    suspend fun signIn(email: String, password: String): Session {
        val result = request("/auth/v1/token?grant_type=password", "POST", JSONObject().put("email", email.trim()).put("password", password)) as JSONObject
        clearSession()
        if (!result.has("expires_at")) result.put("expires_at", System.currentTimeMillis() / 1000 + result.getLong("expires_in"))
        store.write("auth", result.toString())
        return try { loadProfile() } catch (e: Exception) { clearSession(); throw e }
    }
    fun googleOAuthUrl(redirectTo: String = "conectasur://auth/callback"): String =
        "${url.trimEnd('/')}/auth/v1/authorize?provider=google&redirect_to=${encode(redirectTo)}"
    suspend fun isGoogleOAuthEnabled(): Boolean = runCatching {
        val settings = request("/auth/v1/settings") as JSONObject
        settings.optJSONObject("external")?.optBoolean("google", false) == true
    }.getOrDefault(false)
    suspend fun completeOAuthSession(accessToken: String, refreshToken: String, expiresIn: Long = 3600L): Session {
        require(accessToken.isNotBlank() && refreshToken.isNotBlank()) { "Credenciales de Google incompletas" }
        val user = send("/auth/v1/user", "GET", null, "application/json", accessToken) as JSONObject
        clearSession()
        val sessionJson = JSONObject()
            .put("access_token", accessToken)
            .put("refresh_token", refreshToken)
            .put("expires_in", expiresIn)
            .put("expires_at", System.currentTimeMillis() / 1000 + expiresIn)
            .put("user", user)
        store.write("auth", sessionJson.toString())
        return try { loadProfile() } catch (e: Exception) { clearSession(); throw e }
    }
    suspend fun loadProfile(): Session {
        val userId = uid() ?: throw BackendException(401, "Inicia sesion para continuar")
        val rows = request("/rest/v1/profiles?select=*&id=eq.${encode(userId)}", authenticated = true) as JSONArray
        val row = rows.optJSONObject(0)
        if (uid() != userId) throw BackendException(401, "La sesion cambio")
        if (row == null || !row.optBoolean("active") || row.optString("role") !in listOf("admin", "emprendedora", "comprador")) {
            clearSession(); throw BackendException(403, "Tu cuenta fue desactivada o no tiene permisos")
        }
        val auth = storedSession() ?: throw BackendException(401, "La sesion finalizo")
        row.put("email", auth.getJSONObject("user").optString("email"))
        auth.put("profile", row); store.write("auth", auth.toString())
        return row.toSession()
    }
    suspend fun currentSession(): Session? {
        if (uid() == null) return null
        return try { loadProfile() } catch (_: IOException) { cachedProfile() }
    }
    fun clearSession() {
        uid()?.let { store.removePrefix("owner:$it:cache:") }
        store.remove("auth")
    }
    suspend fun signOut() {
        val token = storedSession()?.optString("access_token")
        clearSession()
        if (!token.isNullOrBlank()) runCatching { send("/auth/v1/logout?scope=local", "POST", null, "application/json", token) }
    }
    suspend fun upload(shopId: String, folder: String, jpeg: ByteArray): String {
        require(jpeg.size <= 2097152) { "La foto debe pesar hasta 2 MiB" }
        require(jpeg.size >= 3 && jpeg[0] == 0xff.toByte() && jpeg[1] == 0xd8.toByte() && jpeg[2] == 0xff.toByte()) { "La foto debe ser JPEG" }
        val path = "${encode(shopId)}/${encode(folder)}/${UUID.randomUUID()}.jpg"
        send("/storage/v1/object/shop-images/$path", "POST", jpeg, "image/jpeg", accessToken())
        return "$url/storage/v1/object/public/shop-images/$path"
    }
    private suspend fun send(path: String, method: String, bytes: ByteArray?, type: String, token: String, prefer: String? = null): Any = withContext(Dispatchers.IO) {
        require(path.startsWith('/') && !path.startsWith("//"))
        val connection = URI(url.trimEnd('/') + path).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method; connection.connectTimeout = 15000; connection.readTimeout = 20000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("User-Agent", "ConectaSur-Android/0.3")
            connection.setRequestProperty("apikey", anonKey); connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            prefer?.let { connection.setRequestProperty("Prefer", it) }
            if (bytes != null) {
                connection.setRequestProperty("Content-Type", type); connection.doOutput = true
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val error = runCatching { JSONObject(text) }.getOrNull()
                throw BackendException(status, error?.optString("message")?.takeIf { it.isNotBlank() }
                    ?: error?.optString("msg")?.takeIf { it.isNotBlank() } ?: "No pudimos completar la operacion ($status)")
            }
            if (text.isBlank()) JSONObject.NULL else JSONTokener(text).nextValue()
        } finally { connection.disconnect() }
    }
    companion object {
        fun encode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
        private fun JSONObject.toSession() = Session(getString("id"), optString("email").takeIf { it.isNotBlank() },
            when (getString("role")) { "admin" -> Role.ADMIN; "emprendedora" -> Role.EMPRENDEDORA; else -> Role.COMPRADOR },
            optString("shop_id").takeIf { it.isNotBlank() && it != "null" })
    }
}
