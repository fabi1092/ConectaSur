package cl.surcode.conectasur.data

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import java.security.KeyStore
import java.util.Collections
import java.util.IdentityHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Desbloqueo local opcional. La sesión sigue cifrada por SecureBackendStore y validada por Supabase. */
class BiometricStoreLock(private val context: Context) {
    companion object {
        @Volatile
        private var sessionUnlocked: Boolean = false
        @Volatile
        private var suppressBackgroundLock: Boolean = false
        private val lifecycleRegistered = AtomicBoolean(false)
        private val lockEpochCounter = AtomicLong(0L)
        private val startedActivities: MutableSet<Activity> =
            Collections.synchronizedSet(Collections.newSetFromMap(IdentityHashMap()))

        fun isSessionUnlocked(): Boolean = sessionUnlocked
        fun lockEpoch(): Long = lockEpochCounter.get()
        fun isBackgroundLockSuppressed(): Boolean = suppressBackgroundLock
        fun markSessionUnlocked() { sessionUnlocked = true }
        fun lockSession() {
            sessionUnlocked = false
            lockEpochCounter.incrementAndGet()
        }

        /** Evita bloquear la sesión al abrir selectores del sistema propios del flujo (galería, cámara, voz). */
        fun suppressNextBackgroundLock() { suppressBackgroundLock = true }
        fun clearBackgroundLockSuppression() { suppressBackgroundLock = false }

        fun observeAppLifecycle(context: Context) {
            val app = context.applicationContext as? Application ?: return
            if (!lifecycleRegistered.compareAndSet(false, true)) return
            app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
                override fun onActivityStarted(activity: Activity) {
                    startedActivities.add(activity)
                    suppressBackgroundLock = false
                }
                override fun onActivityResumed(activity: Activity) = Unit
                override fun onActivityPaused(activity: Activity) = Unit
                override fun onActivityStopped(activity: Activity) {
                    startedActivities.remove(activity)
                    if (startedActivities.isEmpty() && !activity.isChangingConfigurations) {
                        if (suppressBackgroundLock) return
                        lockSession()
                    }
                }
                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
                override fun onActivityDestroyed(activity: Activity) {
                    startedActivities.remove(activity)
                }
            })
        }
    }

    private val prefs = context.getSharedPreferences("store_biometric", Context.MODE_PRIVATE)
    private val alias = "cl.surcode.conectasur.store.biometric"
    val enabled get() = prefs.contains("proof") && prefs.contains("iv") && prefs.contains("uid")
    fun available() = BiometricManager.from(context).canAuthenticate(BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS
    private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    fun enrollmentCipher(): Cipher {
        clear()
        val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
        if (Build.VERSION.SDK_INT >= 30) builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        else {
            @Suppress("DEPRECATION")
            builder.setUserAuthenticationValidityDurationSeconds(-1)
        }
        val key = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(builder.build()) }.generateKey()
        return Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
    }
    fun finishEnrollment(cipher: Cipher, uid: String) {
        val proof = cipher.doFinal(uid.toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("proof", encode(proof)).putString("iv", encode(cipher.iv)).putString("uid", uid).commit())
        markSessionUnlocked()
    }
    fun unlockCipher(): Cipher {
        val key = checkNotNull(keyStore().getKey(alias, null) as? SecretKey) { "Clave biométrica no disponible" }
        return Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, decode(requireNotNull(prefs.getString("iv", null)))))
        }
    }
    fun finishUnlock(cipher: Cipher): Boolean {
        val proof = cipher.doFinal(decode(requireNotNull(prefs.getString("proof", null))))
        val owner = SecureBackendStore(context).read("auth")?.let { raw ->
            val json = org.json.JSONObject(raw)
            json.optJSONObject("user")?.optString("id")?.takeIf(String::isNotBlank)
                ?: json.optJSONObject("profile")?.optString("id")?.takeIf(String::isNotBlank)
        }
        val ok = !owner.isNullOrBlank() && String(proof, Charsets.UTF_8) == owner && owner == prefs.getString("uid", null)
        if (ok) markSessionUnlocked()
        return ok
    }
    fun clear() {
        lockSession()
        check(prefs.edit().clear().commit())
        keyStore().let { if (it.containsAlias(alias)) it.deleteEntry(alias) }
    }
    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
    private fun decode(value: String) = Base64.decode(value, Base64.NO_WRAP)
}
