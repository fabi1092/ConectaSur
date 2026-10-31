package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.AuthRepository
import cl.surcode.conectasur.domain.Role
import cl.surcode.conectasur.domain.Session
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await

class FirebaseAuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance()
) : AuthRepository {

    override suspend fun signIn(email: String, password: String): Session {
        val result = auth.signInWithEmailAndPassword(email.trim(), password).await()
        val user = result.user ?: error("No se pudo iniciar sesion")
        return loadSession(user)
    }

    override suspend fun currentSession(): Session? = auth.currentUser?.let { loadSession(it) }

    override fun signOut() = auth.signOut()

    private suspend fun loadSession(user: FirebaseUser): Session {
        val profile = db.collection("users").document(user.uid).get().await()
        if (!profile.exists() || profile.getBoolean("active") != true) {
            auth.signOut()
            error("Tu cuenta no tiene permiso para entrar o fue desactivada")
        }
        val role = when (profile.getString("role")) {
            "admin" -> Role.ADMIN
            "emprendedora" -> Role.EMPRENDEDORA
            else -> Role.COMPRADOR
        }
        return Session(user.uid, user.email, role, profile.getString("shopId"))
    }
}
