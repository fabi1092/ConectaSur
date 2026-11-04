package cl.surcode.conectasur.domain

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Una solicitud Google ligada al dispositivo; no acepta tokens enviados por otras aplicaciones. */
data class GooglePkceRequest(val verifier: String, val state: String, val createdAt: Long) {
    fun isFresh(now: Long) = now >= createdAt && now - createdAt <= LIFETIME_MILLIS
    fun authorizationUrl(backend: String): String {
        val server = URI(backend)
        require(server.scheme == "https" && server.host != null && server.userInfo == null)
        require(verifier.matches(Regex("[A-Za-z0-9_-]{43,128}")) && state.matches(Regex("[A-Za-z0-9_-]{32,128}")))
        val challenge = encodeBytes(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
        val redirect = "$CALLBACK?client_state=$state"
        return backend.trimEnd('/') + "/auth/v1/authorize?provider=google&redirect_to=" + encode(redirect) +
            "&code_challenge=" + encode(challenge) + "&code_challenge_method=s256"
    }

    /** null indica cancelación del proveedor; todos los valores se validan antes de consumir la solicitud. */
    fun callbackCode(callback: String, now: Long): String? {
        require(isFresh(now)) { "El acceso con Google venció. Vuelve a intentarlo." }
        val uri = URI(callback)
        require(uri.scheme == "conectasur" && uri.host == "auth" && uri.path == "/callback" &&
            uri.port == -1 && uri.userInfo == null && uri.fragment.isNullOrEmpty()) { "Retorno de Google no válido" }
        val parameters = linkedMapOf<String, String>()
        uri.rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.forEach { part ->
            val pair = part.split('=', limit = 2)
            val key = URLDecoder.decode(pair[0], "UTF-8")
            require(key !in parameters) { "Retorno de Google ambiguo" }
            parameters[key] = URLDecoder.decode(pair.getOrElse(1) { "" }, "UTF-8")
        }
        require(parameters["client_state"] == state) { "El retorno no corresponde al acceso solicitado" }
        require("access_token" !in parameters && "refresh_token" !in parameters) { "Se requiere un código de Google" }
        if (parameters.containsKey("error")) {
            require("code" !in parameters) { "Retorno de Google ambiguo" }
            return null
        }
        return requireNotNull(parameters["code"]?.takeIf { it.isNotBlank() && it.length <= 4096 }) { "Google no devolvió un código válido" }
    }

    companion object {
        const val CALLBACK = "conectasur://auth/callback"
        const val LIFETIME_MILLIS = 10 * 60 * 1000L
        fun create(now: Long = System.currentTimeMillis()): GooglePkceRequest {
            val random = SecureRandom()
            fun secret() = ByteArray(32).also { random.nextBytes(it) }.let(::encodeBytes)
            return GooglePkceRequest(secret(), secret(), now)
        }
        private fun encodeBytes(bytes: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        private fun encode(value: String) = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}
