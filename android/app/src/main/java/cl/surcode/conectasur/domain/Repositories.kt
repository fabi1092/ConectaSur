package cl.surcode.conectasur.domain

import kotlinx.coroutines.flow.Flow

// Contratos de la capa de datos. Las pantallas SOLO usan estas interfaces
// (nunca HTTP/SQL directo), asi se puede cambiar Demo <-> Supabase sin tocar la UI.

enum class Role { ADMIN, EMPRENDEDORA, COMPRADOR }

data class Session(val uid: String, val email: String?, val role: Role, val shopId: String?)

data class Shop(
    val id: String, val name: String, val description: String, val logoUrl: String?,
    val entrepreneurType: String, val sector: String, val contact: String, val showPrices: Boolean,
    val contactMode: ContactMode = ContactMode.FORM, val whatsappNumber: String = ""
)

/** Una opcion de un producto (talla, color...), con su propio stock. */
data class Variant(val id: String, val label: String, val quantity: Int, val priceClp: Long? = null, val photo: String? = null)

/** Producto tal como lo ve SU dueña: con stock y opciones. */
data class OwnerProduct(val base: CatalogProduct, val variants: List<Variant> = emptyList())

data class Sale(
    val id: String, val productId: String, val productName: String, val variantId: String?,
    val quantity: Int, val priceClp: Long, val place: String, val dateMillis: Long
)

interface AuthRepository {
    /** Entra con correo y clave. Falla si la cuenta no tiene perfil o esta desactivada. */
    suspend fun signIn(email: String, password: String): Session
    suspend fun currentSession(): Session?
    fun signOut()
    suspend fun isGoogleEnabled(): Boolean = false
    val nativeGoogleAvailable: Boolean get() = false
    suspend fun signInWithGoogleIdToken(idToken: String): Session =
        throw UnsupportedOperationException("Acceso con Google no disponible")
    fun beginGoogleSignIn(): String = throw UnsupportedOperationException("Acceso con Google no disponible")
    fun hasPendingGoogleSignIn(): Boolean = false
    fun cancelGoogleSignIn() { }
    suspend fun completeGoogleSignIn(callbackUrl: String): Session =
        throw UnsupportedOperationException("Acceso con Google no disponible")
}

// Sectores de Puerto Montt; fuentes municipales y mantenimiento en docs/fabian/pendientes-android.md.
val PUERTO_MONTT_SECTORS = listOf("Puerto Montt Centro", "Alerce", "Mirasol", "Pichi Pelluco", "Isla Tenglo", "Chinquihue", "El Tepual")
data class ShopChoices(val entrepreneurTypes: List<String> = emptyList(), val sectors: List<String> = PUERTO_MONTT_SECTORS)

interface ShopRepository {
    suspend fun getShop(shopId: String): Shop?
    suspend fun getShopChoices(): ShopChoices
    suspend fun listShopAssociations(shopId: String): List<String> = emptyList()
    suspend fun updateShop(shop: Shop)
    /** Sube el logo (JPEG ya comprimido), guarda su URL en la tienda y la devuelve. */
    suspend fun uploadLogo(shopId: String, jpegBytes: ByteArray): String
}

interface ProductRepository {
    fun ownerProducts(shopId: String): Flow<List<OwnerProduct>>
    /** Guarda el producto privado y actualiza (o retira) su copia publica, todo junto. */
    suspend fun saveProduct(product: OwnerProduct)
    suspend fun deleteProduct(shopId: String, productId: String)
    /** Sube la foto (JPEG ya comprimido) y devuelve su URL. */
    suspend fun uploadPhoto(shopId: String, productId: String, jpegBytes: ByteArray): String
}

interface SalesRepository {
    /** Descuenta stock SOLO de la opcion vendida, retira piezas unicas y guarda la venta. */
    suspend fun registerSale(shopId: String, productId: String, variantId: String?, quantity: Int, place: String)
    fun history(shopId: String): Flow<List<Sale>>
}

/**
 * Logica pura de venta; el servidor vuelve a validar y descontar en una transaccion.
 * Lanza IllegalArgumentException / IllegalStateException si la venta no es valida.
 */
fun OwnerProduct.sell(variantId: String?, quantity: Int): OwnerProduct {
    require(quantity > 0) { "La cantidad debe ser mayor que cero" }
    if (base.stockMode in listOf(StockMode.ON_REQUEST, StockMode.UNLIMITED) || (base.stockMode == StockMode.UNITS && (base.quantity ?: 0) <= 0 && base.soldOut == "ORDER")) return this
    if (variants.isNotEmpty()) {
        val id = requireNotNull(variantId) { "Elige una opcion del producto" }
        val chosen = variants.firstOrNull { it.id == id }
        checkNotNull(chosen) { "La opcion no existe" }
        check(chosen.quantity >= quantity) { "No hay stock suficiente de esa opcion" }
        val updated = variants.map { if (it.id == id) it.copy(quantity = it.quantity - quantity) else it }
        return OwnerProduct(base.copy(quantity = updated.sumOf { it.quantity }), updated)
    }
    val current = base.quantity ?: 0
    check(current >= quantity) { "No hay stock suficiente" }
    val left = if (base.stockMode == StockMode.UNIQUE) 0 else current - quantity
    return OwnerProduct(base.copy(quantity = left), variants)
}
