package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageMetadata
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class FirebaseProductRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val storage: FirebaseStorage = FirebaseStorage.getInstance()
) : ProductRepository {

    private fun privateRef(shopId: String, productId: String) =
        db.collection("shops").document(shopId).collection("products").document(productId)

    private fun publicRef(productId: String) = db.collection("publicProducts").document(productId)

    override fun ownerProducts(shopId: String): Flow<List<OwnerProduct>> = callbackFlow {
        val registration = db.collection("shops").document(shopId).collection("products")
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                if (snapshot != null) {
                    trySend(snapshot.documents.mapNotNull { it.toOwnerProduct() }.sortedBy { it.base.name })
                }
            }
        awaitClose { registration.remove() }
    }

    override suspend fun saveProduct(product: OwnerProduct) {
        // Con opciones, el stock total es la suma de sus opciones.
        val normalized = if (product.variants.isEmpty()) product
        else OwnerProduct(product.base.copy(quantity = product.variants.sumOf { it.quantity }), product.variants)
        val base = normalized.base
        val batch = db.batch()
        batch.set(privateRef(base.shopId, base.id), normalized.toMap())
        if (base.toPublicOrNull() != null) batch.set(publicRef(base.id), base.toPublicMap())
        else batch.delete(publicRef(base.id))
        batch.commit().await()
    }

    override suspend fun deleteProduct(shopId: String, productId: String) {
        val batch = db.batch()
        batch.delete(privateRef(shopId, productId))
        batch.delete(publicRef(productId))
        batch.commit().await()
    }

    override suspend fun uploadPhoto(shopId: String, productId: String, jpegBytes: ByteArray): String {
        val ref = storage.reference.child("shops/$shopId/products/$productId.jpg")
        val metadata = StorageMetadata.Builder().setContentType("image/jpeg").build()
        ref.putBytes(jpegBytes, metadata).await()
        return ref.downloadUrl.await().toString()
    }
}
