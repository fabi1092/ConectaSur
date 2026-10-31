package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.Transaction
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class FirebaseSalesRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance()
) : SalesRepository {

    override suspend fun registerSale(
        shopId: String, productId: String, variantId: String?, quantity: Int, place: String
    ) {
        val productRef = db.collection("shops").document(shopId).collection("products").document(productId)
        val publicRef = db.collection("publicProducts").document(productId)
        val saleRef = db.collection("shops").document(shopId).collection("sales").document()

        // Transaccion: o se hace todo (stock + catalogo publico + historial) o nada.
        db.runTransaction(Transaction.Function<Void?> { tx ->
            val snapshot = tx.get(productRef)
            val product = snapshot.toOwnerProduct() ?: error("El producto no existe")
            val updated = product.sell(variantId, quantity)   // valida stock y descuenta solo esa opcion

            tx.set(productRef, updated.toMap())
            if (updated.base.toPublicOrNull() != null) tx.set(publicRef, updated.base.toPublicMap())
            else tx.delete(publicRef)                          // pieza unica vendida / agotado: sale del catalogo

            tx.set(
                saleRef, mapOf(
                    "productId" to productId,
                    "productName" to product.base.name,
                    "variantId" to variantId,
                    "quantity" to quantity.toLong(),
                    "priceClp" to product.base.priceClp,
                    "place" to place,
                    "dateMillis" to System.currentTimeMillis(),
                    "createdAt" to FieldValue.serverTimestamp()
                )
            )
            null
        }).await()
    }

    override fun history(shopId: String): Flow<List<Sale>> = callbackFlow {
        val registration = db.collection("shops").document(shopId).collection("sales")
            .orderBy("dateMillis", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) { close(error); return@addSnapshotListener }
                if (snapshot != null) {
                    trySend(snapshot.documents.map { d ->
                        Sale(
                            id = d.id,
                            productId = d.getString("productId").orEmpty(),
                            productName = d.getString("productName").orEmpty(),
                            variantId = d.getString("variantId"),
                            quantity = d.getLong("quantity")?.toInt() ?: 0,
                            priceClp = d.getLong("priceClp") ?: 0L,
                            place = d.getString("place").orEmpty(),
                            dateMillis = d.getLong("dateMillis") ?: 0L
                        )
                    })
                }
            }
        awaitClose { registration.remove() }
    }
}
