package cl.surcode.conectasur.data

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Desbloqueo local opcional. La sesión sigue cifrada por SecureBackendStore y validada por Supabase. */
class BiometricStoreLock(private val context: Context) {
    private val prefs = context.getSharedPreferences("store_biometric", Context.MODE_PRIVATE)
    private val alias = "cl.surcode.conectasur.store.biometric"
    val enabled get() = prefs.contains("proof")
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
    }
    fun unlockCipher(): Cipher {
        val key = keyStore().getKey(alias, null) as SecretKey
        return Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, decode(requireNotNull(prefs.getString("iv", null)))))
        }
    }
    fun finishUnlock(cipher: Cipher): Boolean {
        val proof = cipher.doFinal(decode(requireNotNull(prefs.getString("proof", null))))
        val owner = SecureBackendStore(context).read("auth")?.let { org.json.JSONObject(it).optJSONObject("user")?.optString("id") }
        return String(proof, Charsets.UTF_8) == owner && owner == prefs.getString("uid", null)
    }
    fun clear() {
        check(prefs.edit().clear().commit())
        keyStore().let { if (it.containsAlias(alias)) it.deleteEntry(alias) }
    }
    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
    private fun decode(value: String) = Base64.decode(value, Base64.NO_WRAP)
}
