package cl.surcode.conectasur.ui

import android.content.Context
import android.util.Base64
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import cl.surcode.conectasur.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.security.SecureRandom
import org.json.JSONObject

/** Selector oficial de cuentas Android. Firebase verifica después el token en la capa de datos. */
class GoogleAccountChooser(private val context: Context) {
    suspend fun requestToken(): String {
        val nonce = Base64.encodeToString(ByteArray(32).also { SecureRandom().nextBytes(it) },Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        val option=GetGoogleIdOption.Builder().setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false).setAutoSelectEnabled(false).setNonce(nonce).build()
        val credential=CredentialManager.create(context).getCredential(context,GetCredentialRequest.Builder().addCredentialOption(option).build()).credential
        check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { "Elige una cuenta de Google para continuar." }
        val token=GoogleIdTokenCredential.createFrom(credential.data).idToken
        val parts=token.split('.')
        check(parts.size==3 && JSONObject(String(Base64.decode(parts[1],Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),Charsets.UTF_8)).optString("nonce")==nonce) {
            "No pudimos comprobar el acceso. Vuelve a intentarlo."
        }
        return token
    }
}
