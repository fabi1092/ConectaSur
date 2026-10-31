package cl.surcode.conectasur.data

import android.content.Context

data class AccessibilitySettings(val textScale: Float = 1f, val largeButtons: Boolean = false,
    val highContrast: Boolean = false, val slowVoice: Boolean = false)
class AccessibilityPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("presentation", Context.MODE_PRIVATE)
    fun read() = AccessibilitySettings(prefs.getFloat("text_scale", 1f).coerceIn(1f, 1.3f),
        prefs.getBoolean("large_buttons", false), prefs.getBoolean("contrast", false), prefs.getBoolean("slow_voice", false))
    fun save(value: AccessibilitySettings) {
        prefs.edit().putFloat("text_scale", value.textScale).putBoolean("large_buttons", value.largeButtons)
            .putBoolean("contrast", value.highContrast).putBoolean("slow_voice", value.slowVoice).apply()
    }
    var logoUri: String?
        get() = prefs.getString("demo_logo", null)
        set(value) { prefs.edit().putString("demo_logo", value).apply() }
}
