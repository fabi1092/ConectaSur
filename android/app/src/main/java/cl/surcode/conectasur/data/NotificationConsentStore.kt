package cl.surcode.conectasur.data

import android.content.Context
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale

interface ConsentStorage {
    fun getBoolean(key: String, defaultValue: Boolean): Boolean
    fun putBoolean(key: String, value: Boolean)
    fun getLong(key: String, defaultValue: Long): Long
    fun putLong(key: String, value: Long)
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
}

class SharedPreferencesConsentStorage(context: Context, prefsName: String = "conectasur_push_prefs") : ConsentStorage {
    private val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
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

    fun isScheduleEnabled(): Boolean = storage.getBoolean(KEY_SCHEDULE_ENABLED, true)

    fun allowedStartHour(): Int =
        storage.getLong(KEY_SCHEDULE_START_HOUR, DEFAULT_START_HOUR.toLong()).toInt().coerceIn(0, 23)

    fun allowedEndHour(): Int =
        storage.getLong(KEY_SCHEDULE_END_HOUR, DEFAULT_END_HOUR.toLong()).toInt().coerceIn(0, 23)

    fun setNotificationSchedule(startHour: Int, endHour: Int, enabled: Boolean = true) {
        require(startHour in 0..23 && endHour in 0..23 && startHour != endHour) {
            "El horario de inicio y término debe usar horas distintas entre 00:00 y 23:00."
        }
        storage.putBoolean(KEY_SCHEDULE_ENABLED, enabled)
        storage.putLong(KEY_SCHEDULE_START_HOUR, startHour.toLong())
        storage.putLong(KEY_SCHEDULE_END_HOUR, endHour.toLong())
    }

    fun shouldDeliverNotificationAt(hourOfDay: Int): Boolean {
        if (!isConsented()) return false
        if (!isScheduleEnabled()) return true
        val h = hourOfDay.coerceIn(0, 23)
        val start = allowedStartHour()
        val end = allowedEndHour()
        return when {
            start < end -> h in start until end
            start > end -> h >= start || h < end
            else -> true
        }
    }

    fun shouldDeliverNotificationNow(zoneId: ZoneId = ZoneId.systemDefault()): Boolean =
        shouldDeliverNotificationAt(ZonedDateTime.now(zoneId).hour)

    fun formatScheduleLabel(): String =
        "${formatHour(allowedStartHour())} a ${formatHour(allowedEndHour())} hrs"

    fun formatScheduleSummary(): String = when {
        !isConsented() -> "Avisos desactivados en este teléfono (horario guardado: ${formatScheduleLabel()})."
        !isScheduleEnabled() -> "Avisos activos sin restricción de horario."
        else -> "Avisos activos · Horario permitido: ${formatScheduleLabel()}"
    }

    companion object {
        private const val KEY_CONSENT_GIVEN = "consent_given"
        private const val KEY_CONSENT_AT = "consent_at_ms"
        private const val KEY_OPT_OUT_AT = "opt_out_at_ms"
        private const val KEY_FCM_TOKEN = "last_fcm_token"
        private const val KEY_SCHEDULE_ENABLED = "schedule_enabled"
        private const val KEY_SCHEDULE_START_HOUR = "schedule_start_hour"
        private const val KEY_SCHEDULE_END_HOUR = "schedule_end_hour"
        const val DEFAULT_START_HOUR = 9
        const val DEFAULT_END_HOUR = 20

        fun formatHour(hour: Int): String =
            String.format(Locale.ROOT, "%02d:00", hour.coerceIn(0, 23))

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

            val isInvitation = type in listOf("invitation", "fair_invitation")
            val isFollowed = type in listOf("follow_fair_confirmed", "followed_fair")

            val title = when {
                cleanTitle.isNotBlank() -> cleanTitle
                isInvitation -> "Invitación a feria"
                isFollowed -> if (cleanFair.isNotBlank()) "Feria confirmada: $cleanFair" else "Novedad de tienda seguida"
                else -> "Aviso de ConectaSur"
            }

            val baseBody = when {
                cleanBody.isNotBlank() -> cleanBody
                isInvitation && cleanFair.isNotBlank() -> "Te invitaron a participar en $cleanFair. Toca para confirmar."
                isInvitation -> "Tienes una nueva invitación a feria en ConectaSur."
                isFollowed && cleanFair.isNotBlank() -> "Una tienda o asociación que sigues confirmó su participación en $cleanFair."
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
