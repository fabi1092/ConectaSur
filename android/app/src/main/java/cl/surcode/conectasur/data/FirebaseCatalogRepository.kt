package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.CatalogRepository
import cl.surcode.conectasur.domain.PublicProduct
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Catalogo publico leido de Firestore (coleccion publicProducts).
 * Firestore guarda una copia local: sin internet se sigue viendo lo ultimo descargado.
 */
class FirebaseCatalogRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance()
) : CatalogRepository {
    private val state = MutableStateFlow<List<PublicProduct>>(emptyList())
    override val publicProducts: StateFlow<List<PublicProduct>> = state.asStateFlow()

    init {
        db.collection("publicProducts").addSnapshotListener { snapshot, _ ->
            if (snapshot != null) {
                state.value = snapshot.documents.mapNotNull { it.toPublicProduct() }.sortedBy { it.name }
            }
        }
    }
}
