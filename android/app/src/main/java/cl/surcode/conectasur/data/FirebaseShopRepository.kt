package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.Shop
import cl.surcode.conectasur.domain.ShopRepository
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageMetadata
import kotlinx.coroutines.tasks.await

class FirebaseShopRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val storage: FirebaseStorage = FirebaseStorage.getInstance()
) : ShopRepository {

    override suspend fun getShop(shopId: String): Shop? =
        db.collection("shops").document(shopId).get().await().toShop()

    override suspend fun updateShop(shop: Shop) {
        // Solo campos que las reglas permiten editar a la emprendedora.
        val changes = mapOf(
            "name" to shop.name,
            "description" to shop.description,
            "entrepreneurType" to shop.entrepreneurType,
            "sector" to shop.sector,
            "contact" to shop.contact,
            "showPrices" to shop.showPrices,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        db.collection("shops").document(shop.id).update(changes).await()
    }

    override suspend fun uploadLogo(shopId: String, jpegBytes: ByteArray): String {
        val ref = storage.reference.child("shops/$shopId/logo.jpg")
        val metadata = StorageMetadata.Builder().setContentType("image/jpeg").build()
        ref.putBytes(jpegBytes, metadata).await()
        val url = ref.downloadUrl.await().toString()
        db.collection("shops").document(shopId)
            .update(mapOf("logoUrl" to url, "updatedAt" to FieldValue.serverTimestamp())).await()
        return url
    }
}
