package cl.surcode.conectasur.data

import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import cl.surcode.conectasur.BuildConfig
import cl.surcode.conectasur.domain.Role
import cl.surcode.conectasur.domain.Session
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/** Firebase autentica al comprador. Sus tokens no se envían como credenciales de Supabase. */
class FirebaseBuyerAuth(private val context: Context) {
    private val app: FirebaseApp = FirebaseApp.getApps(context).find { it.name == "conectasur-google-buyer" }
        ?: FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
            .setApplicationId(BuildConfig.FIREBASE_APP_ID).setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID).build(), "conectasur-google-buyer")
    private val auth = FirebaseAuth.getInstance(app)
    @Volatile private var generation = 0L
    val hasUser get() = auth.currentUser != null
    suspend fun currentSession(): Session? {
        val user = auth.currentUser ?: return null
        try {
            user.reload().await()
            if (auth.currentUser?.uid != user.uid) return null
            val token = user.getIdToken(false).await()
            val claims = token.claims
            check(claims["sub"] == user.uid && claims["aud"] == BuildConfig.FIREBASE_PROJECT_ID &&
                claims["iss"] == "https://securetoken.google.com/${BuildConfig.FIREBASE_PROJECT_ID}" &&
                (claims["firebase"] as? Map<*, *>)?.get("sign_in_provider") == "google.com" && claims["email_verified"] == true) {
                "Vuelve a ingresar con tu cuenta de Google."
            }
            return Session("firebase:${user.uid}", user.email, Role.COMPRADOR, null)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: FirebaseAuthInvalidUserException) { auth.signOut(); throw IllegalStateException("Tu sesión de Google terminó. Vuelve a ingresar.") }
        catch (error: IllegalStateException) { auth.signOut(); throw error }
        catch (error: FirebaseNetworkException) { throw java.io.IOException("No pudimos comprobar tu cuenta. Revisa tu conexión.", error) }
    }
    suspend fun signIn(idToken: String): Session {
        check(!hasUser) { "Cierra tu sesión antes de cambiar de cuenta." }
        val stamp = ++generation
        val task = auth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null))
        task.addOnCompleteListener { result ->
            if (stamp != generation && result.isSuccessful && auth.currentUser?.uid == result.result.user?.uid) auth.signOut()
        }
        try {
            task.await()
            if (stamp != generation) throw CancellationException("Acceso cancelado")
            val session = requireNotNull(currentSession()) { "No pudimos comprobar tu cuenta de Google." }
            if (stamp != generation) throw CancellationException("Acceso cancelado")
            return session
        } catch (cancelled: CancellationException) { if (stamp == generation) cancelPending(); throw cancelled }
        catch (error: Exception) {
            // Si Firebase aceptó el acceso pero falla la lectura por red, conserva su sesión SDK.
            if (stamp == generation && error !is java.io.IOException) auth.signOut()
            throw error
        }
    }
    fun cancelPending() { generation++ }
    fun signOut() { generation++; auth.signOut() }
    suspend fun clearCredentialState() {
        try { CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest()) }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { /* La sesión de Firebase ya se eliminó; no se restaura por un proveedor del sistema. */ }
    }
    companion object {
        fun configured() = listOf(BuildConfig.FIREBASE_API_KEY, BuildConfig.FIREBASE_APP_ID,
            BuildConfig.FIREBASE_PROJECT_ID, BuildConfig.GOOGLE_WEB_CLIENT_ID).all(String::isNotBlank)
    }
}
