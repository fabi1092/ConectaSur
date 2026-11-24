package cl.surcode.conectasur.domain

import kotlinx.coroutines.flow.Flow

// Contratos de la capa de datos. Las pantallas SOLO usan estas interfaces
// (nunca HTTP/SQL directo), asi se puede cambiar Demo <-> Supabase sin tocar la UI.

enum class Role { ADMIN, EMPRENDEDORA, COMPRADOR }

data class Session(val uid: String, val email: String?, val role: Role, val shopId: String?)

data class Shop(
    val id: String, val name: String, val description: String, val logoUrl: String?,
    val entrepreneurType: String, val sector: String, val contact: String, val showPrices: Boolean,
    val contactMode: ContactMode = ContactMode.FORM, val whatsappNumber: String = "",
    val pickupLabel: String = "", val pickupLat: Double? = null, val pickupLng: Double? = null,
    val allowRatings: Boolean = true,
    val contactNotifications: Boolean = true,
    val notifyFrom: String = "08:00",
    val notifyUntil: String = "21:00"
)

data class PublicAssociation(
    val id: String, val name: String, val description: String, val logoUrl: String?,
    val sector: String, val contact: String, val shopIds: List<String> = emptyList()
)

data class PublicFair(
    val id: String, val name: String, val description: String, val imageUrl: String?,
    val placeName: String, val latitude: Double, val longitude: Double,
    val startsAt: String, val endsAt: String, val organizer: String,
    val status: String = "published", val distanceKm: Double? = null
)

enum class FairParticipantStatus(val wire: String) {
    INVITED("invited"),
    CONFIRMED("confirmed"),
    REJECTED("rejected"),
    ADDED_BY_ADMIN("added_by_admin");

    val isPubliclyConfirmed: Boolean
        get() = this == CONFIRMED || this == ADDED_BY_ADMIN

    companion object {
        fun from(value: String?): FairParticipantStatus? = when (value?.trim()?.lowercase()) {
            "invited" -> INVITED
            "confirmed" -> CONFIRMED
            "rejected", "declined" -> REJECTED
            "added", "added_by_admin" -> ADDED_BY_ADMIN
            else -> null
        }
    }
}

data class FairParticipant(
    val fairId: String,
    val shopId: String,
    val shopName: String,
    val status: FairParticipantStatus,
    val sector: String = "",
    val entrepreneurType: String = "",
    val sampleProducts: List<PublicProduct> = emptyList(),
    val isAssociation: Boolean = false
)

fun buildPublicFairShowcase(
    participants: List<FairParticipant>,
    publicProducts: List<PublicProduct>,
    maxProductsPerShop: Int = 3
): List<FairParticipant> {
    if (participants.isEmpty()) return emptyList()
    val byShop = publicProducts.groupBy { it.shopId }
    return participants
        .filter { it.status.isPubliclyConfirmed && it.shopId.isNotBlank() }
        .distinctBy { it.shopId }
        .map { participant ->
            val mergedProducts = (participant.sampleProducts + byShop[participant.shopId].orEmpty())
                .distinctBy { it.id }
                .take(maxProductsPerShop.coerceAtLeast(0))
            participant.copy(sampleProducts = mergedProducts)
        }
        .sortedBy { it.shopName.lowercase() }
}

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
    suspend fun listPublicShops(): List<Shop> = emptyList()
    suspend fun listPublicAssociations(): List<PublicAssociation> = emptyList()
    suspend fun listPublicFairs(lat: Double? = null, lng: Double? = null): List<PublicFair> = emptyList()
    suspend fun listFairParticipants(fairId: String): List<FairParticipant> = emptyList()
    suspend fun listOwnerFairCalendar(shopId: String): List<OwnerFairCalendarItem> = emptyList()
    suspend fun respondToFairInvitation(shopId: String, fairId: String, participate: Boolean): FairParticipantStatus =
        applyOneTapFairDecision(participate)
    suspend fun suggestFairsForSale(shopId: String, lat: Double? = null, lng: Double? = null): List<FairSaleSuggestion> = emptyList()
    suspend fun getAnonymousNavigation(): String = "allow"
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

data class AppNotification(
    val id: String,
    val kind: String,
    val title: String,
    val body: String = "",
    val fairId: String? = null,
    val fairName: String? = null,
    val shopId: String? = null,
    val createdAtMillis: Long = 0L,
    val readAtMillis: Long? = null
) {
    val isUnread: Boolean get() = readAtMillis == null
}

interface PushRepository {
    suspend fun setNotificationConsent(granted: Boolean) {}
    suspend fun registerDeviceToken(token: String, platform: String = "android") {}
    suspend fun unregisterDeviceToken(token: String) {}
    suspend fun listNotifications(limit: Int = 50): List<AppNotification> = emptyList()
    suspend fun markNotificationsRead(ids: List<String>): Int = 0
}

enum class FollowTargetType(val wire: String) {
    SHOP("shop"),
    ASSOCIATION("association");

    companion object {
        fun from(value: String?): FollowTargetType? = entries.firstOrNull { it.wire == value?.lowercase() }
    }
}

data class FollowedTarget(
    val targetType: FollowTargetType,
    val targetId: String,
    val targetName: String = "",
    val followedAtMillis: Long = 0L
)

data class PendingFollowAction(
    val targetType: FollowTargetType,
    val targetId: String,
    val targetName: String,
    val destinationScreen: String,
    val destinationId: String
)

enum class RatingTargetType(val wire: String) {
    SHOP("shop"),
    PRODUCT("product");

    companion object {
        fun from(value: String?): RatingTargetType? = entries.firstOrNull { it.wire == value?.lowercase() }
    }
}

data class RatingEntry(
    val id: String,
    val targetType: RatingTargetType,
    val targetId: String,
    val score: Int,
    val comment: String = "",
    val authorLabel: String = "",
    val createdAtMillis: Long = 0L
)

data class RatingSummary(
    val average: Double,
    val count: Int,
    val userRating: RatingEntry? = null,
    val recent: List<RatingEntry> = emptyList()
)

interface FollowRepository {
    suspend fun listFollows(buyerId: String): List<FollowedTarget>
    suspend fun follow(buyerId: String, type: FollowTargetType, id: String, name: String): FollowedTarget
    suspend fun unfollow(buyerId: String, type: FollowTargetType, id: String): Boolean
}

interface RatingRepository {
    suspend fun summary(type: RatingTargetType, targetId: String, buyerId: String?, shopId: String = ""): RatingSummary
    suspend fun submit(
        type: RatingTargetType,
        targetId: String,
        score: Int,
        comment: String,
        buyerId: String?,
        authorLabel: String,
        ratingsAllowed: Boolean,
        shopId: String = ""
    ): RatingEntry
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
