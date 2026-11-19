package cl.surcode.conectasur.data

import android.content.Context

interface ConsentStorage {
    fun getBoolean(key: String, defaultValue: Boolean): Boolean
    fun putBoolean(key: String, value: Boolean)
    fun getLong(key: String, defaultValue: Long): Long
    fun putLong(key: String, value: Long)
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
}

class SharedPreferencesConsentStorage(context: Context) : ConsentStorage {
    private val prefs = context.getSharedPreferences("conectasur_push_prefs", Context.MODE_PRIVATE)
    override fun getBoolean(key: String, defaultValue: Boolean) = prefs.getBoolean(key, defaultValue)
    override fun putBoolean(key: String, value: Boolean) { prefs.edit().putBoolean(key, value).apply() }
    override fun getLong(key: String, defaultValue: Long) = prefs.getLong(key, defaultValue)
    override fun putLong(key: String, value: Long) { prefs.edit().putLong(key, value).apply() }
    override fun getString(key: String): String? = prefs.getString(key, null)
    override fun putString(key: String, value: String?) {
        prefs.edit().apply {
            if (value == null) remove(key) else putString(key, value)
        }.apply()
    }
}

/**
 * Registra el consentimiento explícito antes de activar notificaciones push y permite
 * darse de baja limpiando el token guardado (RNF-PRI-02 / A14).
 */
class NotificationConsentStore(private val storage: ConsentStorage) {
    constructor(context: Context) : this(SharedPreferencesConsentStorage(context.applicationContext))

    fun isConsented(): Boolean = storage.getBoolean(KEY_CONSENT_GIVEN, false)
    fun lastToken(): String? = storage.getString(KEY_FCM_TOKEN)?.takeIf { it.isNotBlank() }
    fun consentTimestampMs(): Long = storage.getLong(KEY_CONSENT_AT, 0L)
    fun optOutTimestampMs(): Long = storage.getLong(KEY_OPT_OUT_AT, 0L)

    fun grantConsent(nowMs: Long = System.currentTimeMillis()) {
        storage.putBoolean(KEY_CONSENT_GIVEN, true)
        storage.putLong(KEY_CONSENT_AT, nowMs)
    }

    fun saveTokenIfConsented(token: String): Boolean {
        val clean = token.trim()
        if (!isConsented() || clean.isBlank()) return false
        storage.putString(KEY_FCM_TOKEN, clean)
        return true
    }

    fun revokeConsent(nowMs: Long = System.currentTimeMillis()): String? {
        val previous = lastToken()
        storage.putBoolean(KEY_CONSENT_GIVEN, false)
        storage.putString(KEY_FCM_TOKEN, null)
        storage.putLong(KEY_OPT_OUT_AT, nowMs)
        return previous
    }

    companion object {
        private const val KEY_CONSENT_GIVEN = "consent_given"
        private const val KEY_CONSENT_AT = "consent_at_ms"
        private const val KEY_OPT_OUT_AT = "opt_out_at_ms"
        private const val KEY_FCM_TOKEN = "last_fcm_token"

        fun extractGcmSenderId(firebaseAppId: String): String? {
            val candidate = firebaseAppId.trim().split(":").getOrNull(1)?.trim().orEmpty()
            return candidate.takeIf { it.isNotEmpty() && it.all(Char::isDigit) }
        }

        fun buildFairNotificationText(
            rawTitle: String?,
            rawBody: String?,
            fairName: String?,
            type: String?
        ): Pair<String, String> {
            val cleanFair = fairName?.trim().orEmpty()
            val cleanTitle = rawTitle?.trim().orEmpty()
            val cleanBody = rawBody?.trim().orEmpty()

            val title = when {
                cleanTitle.isNotBlank() -> cleanTitle
                type == "fair_invitation" -> "Invitación a feria"
                type == "followed_fair" -> if (cleanFair.isNotBlank()) "Feria confirmada: $cleanFair" else "Novedad de tienda seguida"
                else -> "Aviso de ConectaSur"
            }

            val baseBody = when {
                cleanBody.isNotBlank() -> cleanBody
                type == "fair_invitation" && cleanFair.isNotBlank() -> "Te invitaron a participar en $cleanFair. Toca para confirmar."
                type == "fair_invitation" -> "Tienes una nueva invitación a feria en ConectaSur."
                type == "followed_fair" && cleanFair.isNotBlank() -> "Una tienda o asociación que sigues confirmó su participación en $cleanFair."
                else -> "Tienes una nueva notificación en ConectaSur."
            }

            val finalBody = if (cleanFair.isNotBlank() &&
                !title.contains(cleanFair, ignoreCase = true) &&
                !baseBody.contains(cleanFair, ignoreCase = true)
            ) {
                "$baseBody ($cleanFair)"
            } else {
                baseBody
            }
            return title to finalBody
        }
    }
}
