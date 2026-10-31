package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue

// Conversion entre los objetos de la app y los documentos de Firestore.
// Nombres de campos = los de docs/felipe/modelo-datos.md

internal fun OwnerProduct.toMap(): Map<String, Any?> = mapOf(
    "id" to base.id,
    "shopId" to base.shopId,
    "name" to base.name,
    "description" to base.description,
    "category" to base.category,
    "priceClp" to base.priceClp,
    "showPrice" to base.showPrice,
    "stockMode" to base.stockMode.name,
    "quantity" to base.quantity?.toLong(),
    "visible" to base.visible,
    "photo" to base.photo,
    "variants" to variants.map { mapOf("id" to it.id, "label" to it.label, "quantity" to it.quantity.toLong()) },
    "updatedAt" to FieldValue.serverTimestamp()
)

/** Copia PUBLICA: sin stock ni precio oculto. Debe calzar con validPublic() de firestore.rules. */
internal fun CatalogProduct.toPublicMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "shopId" to shopId,
    "name" to name,
    "description" to description,
    "category" to category,
    "priceClp" to priceClp.takeIf { showPrice },
    "onRequest" to (stockMode == StockMode.ON_REQUEST),
    "photo" to photo,
    "updatedAt" to FieldValue.serverTimestamp()
)

internal fun DocumentSnapshot.toOwnerProduct(): OwnerProduct? {
    val name = getString("name") ?: return null
    val mode = runCatching { StockMode.valueOf(getString("stockMode") ?: "UNITS") }.getOrDefault(StockMode.UNITS)
    @Suppress("UNCHECKED_CAST")
    val rawVariants = get("variants") as? List<Map<String, Any?>> ?: emptyList()
    val variants = rawVariants.map {
        Variant(
            id = (it["id"] as? String).orEmpty(),
            label = (it["label"] as? String).orEmpty(),
            quantity = (it["quantity"] as? Number)?.toInt() ?: 0
        )
    }
    val base = CatalogProduct(
        id = getString("id") ?: id,
        shopId = getString("shopId").orEmpty(),
        name = name,
        description = getString("description").orEmpty(),
        category = getString("category").orEmpty(),
        priceClp = getLong("priceClp") ?: 0L,
        showPrice = getBoolean("showPrice") ?: true,
        stockMode = mode,
        quantity = getLong("quantity")?.toInt(),
        visible = getBoolean("visible") ?: true,
        photo = getString("photo").orEmpty()
    )
    return OwnerProduct(base, variants)
}

internal fun DocumentSnapshot.toPublicProduct(): PublicProduct? {
    val name = getString("name") ?: return null
    return PublicProduct(
        id = getString("id") ?: id,
        shopId = getString("shopId").orEmpty(),
        name = name,
        description = getString("description").orEmpty(),
        category = getString("category").orEmpty(),
        priceClp = getLong("priceClp"),
        onRequest = getBoolean("onRequest") ?: false,
        photo = getString("photo").orEmpty()
    )
}

internal fun DocumentSnapshot.toShop(): Shop? {
    val name = getString("name") ?: return null
    return Shop(
        id = id, name = name,
        description = getString("description").orEmpty(),
        logoUrl = getString("logoUrl"),
        entrepreneurType = getString("entrepreneurType").orEmpty(),
        sector = getString("sector").orEmpty(),
        contact = getString("contact").orEmpty(),
        showPrices = getBoolean("showPrices") ?: true
    )
}
