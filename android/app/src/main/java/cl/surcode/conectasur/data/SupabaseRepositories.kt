package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID

class SupabaseCatalogRepository(private val client: SupabaseClient) : CatalogRepository {
    private val state = MutableStateFlow(runCatching { JSONArray(client.store.read("public_catalog") ?: "[]").rows { it.toPublicProduct() } }.getOrDefault(emptyList()))
    override val publicProducts: StateFlow<List<PublicProduct>> = state.asStateFlow()
    private val sync = MutableStateFlow<String?>("Estamos conectando con ConectaSur…")
    override val status = sync.asStateFlow()
    override suspend fun refresh() {
        try {
            val rows = client.request("/rest/v1/public_products?select=*&order=name") as JSONArray
            state.value = rows.rows { it.toPublicProduct() }; client.store.write("public_catalog", rows.toString()); sync.value = null
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: IOException) { sync.value = if (state.value.isEmpty()) "Sin conexion. Revisa Internet para cargar productos." else "Sin conexion. Mostramos el catalogo guardado." }
        catch (_: Exception) { sync.value = "No pudimos actualizar el catalogo. Intentaremos nuevamente." }
    }
}
class SupabaseAuthRepository(private val client: SupabaseClient, private val firebase: FirebaseBuyerAuth? = null) : AuthRepository {
    override fun beginGoogleSignIn() = client.beginGoogleSignIn()
    override fun hasPendingGoogleSignIn() = client.hasPendingGoogleSignIn()
    override fun cancelGoogleSignIn() { client.cancelGoogleSignIn(); firebase?.cancelPending() }
    override suspend fun completeGoogleSignIn(callbackUrl: String) = client.completeGoogleSignIn(callbackUrl)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override suspend fun signIn(email: String, password: String): Session {
        check(firebase?.hasUser != true) { "Cierra tu sesión antes de cambiar de cuenta." }
        return client.signIn(email, password)
    }
    override suspend fun currentSession() = client.currentSession() ?: firebase?.currentSession()
    override fun signOut() {
        firebase?.signOut()
        scope.launch(start = CoroutineStart.UNDISPATCHED) { client.signOut(); firebase?.clearCredentialState() }
    }
    override val nativeGoogleAvailable get() = firebase != null
    override suspend fun isGoogleEnabled() = firebase != null || client.isGoogleOAuthEnabled()
    override suspend fun signInWithGoogleIdToken(idToken: String): Session {
        check(client.currentSession() == null) { "Cierra tu sesión antes de cambiar de cuenta." }
        return requireNotNull(firebase) { "Google aún no está configurado." }.signIn(idToken)
    }
}
class SupabaseShopRepository(private val client: SupabaseClient) : ShopRepository {
    private fun allowRatingsKey(shopId: String) = "shop_allow_ratings:$shopId"
    private fun readLocalAllowRatings(shopId: String): Boolean? =
        client.store.read(allowRatingsKey(shopId))?.toBooleanStrictOrNull()
    private fun writeLocalAllowRatings(shopId: String, allow: Boolean) {
        client.store.write(allowRatingsKey(shopId), allow.toString())
    }
    private fun JSONObject.toShopWithLocalFallback(): Shop {
        val base = toShop()
        val effectiveAllow = if (has("allow_ratings")) {
            base.allowRatings.also { writeLocalAllowRatings(base.id, it) }
        } else {
            readLocalAllowRatings(base.id) ?: base.allowRatings
        }
        return if (effectiveAllow == base.allowRatings) base else base.copy(allowRatings = effectiveAllow)
    }
    private fun fairDecisionsKey(shopId: String) = "owner_fair_decisions:$shopId"
    private fun readLocalFairDecisions(shopId: String): Map<String, FairParticipantStatus> {
        val raw = client.store.read(fairDecisionsKey(shopId)) ?: return emptyMap()
        val obj = runCatching { JSONObject(raw) }.getOrNull() ?: return emptyMap()
        val map = mutableMapOf<String, FairParticipantStatus>()
        for (key in obj.keys()) {
            val status = FairParticipantStatus.from(obj.optString(key)) ?: continue
            map[key] = status
        }
        return map
    }
    private fun writeLocalFairDecision(shopId: String, fairId: String, status: FairParticipantStatus) {
        val obj = runCatching { JSONObject(client.store.read(fairDecisionsKey(shopId)) ?: "{}") }.getOrElse { JSONObject() }
        obj.put(fairId, status.wire)
        client.store.write(fairDecisionsKey(shopId), obj.toString())
    }
    override suspend fun getShopChoices(): ShopChoices {
        val types = client.request("/rest/v1/entrepreneur_types?select=name&order=name") as JSONArray
        val names = (0 until types.length()).mapNotNull {
            types.optJSONObject(it)?.optString("name")?.trim()?.takeIf(String::isNotBlank)
        }.distinct()
        return ShopChoices(entrepreneurTypes = names)
    }
    override suspend fun getShop(shopId: String) =
        (client.request("/rest/v1/public_shops?select=*&id=eq.${SupabaseClient.encode(shopId)}") as JSONArray)
            .optJSONObject(0)?.toShopWithLocalFallback()
    override suspend fun listPublicShops(): List<Shop> {
        val rows = client.request("/rest/v1/public_shops?select=*&order=name") as JSONArray
        return rows.rows { it.toShopWithLocalFallback() }
    }
    override suspend fun listPublicAssociations(): List<PublicAssociation> {
        val rows = client.request("/rest/v1/associations?select=id,name,description,logo_url,sector,contact,active&active=eq.true&order=name") as JSONArray
        val links = client.request("/rest/v1/shop_associations?select=shop_id,association_id") as JSONArray
        val byAssoc = mutableMapOf<String, MutableList<String>>()
        for (i in 0 until links.length()) {
            val l = links.optJSONObject(i) ?: continue
            val aId = l.optString("association_id")
            val sId = l.optString("shop_id")
            if (aId.isNotBlank() && sId.isNotBlank()) byAssoc.getOrPut(aId) { mutableListOf() }.add(sId)
        }
        return (0 until rows.length()).mapNotNull { i ->
            val r = rows.optJSONObject(i) ?: return@mapNotNull null
            val id = r.optString("id")
            PublicAssociation(
                id = id,
                name = r.optString("name"),
                description = r.optString("description"),
                logoUrl = r.nullableString("logo_url"),
                sector = r.optString("sector"),
                contact = r.optString("contact"),
                shopIds = byAssoc[id].orEmpty()
            )
        }
    }
    override suspend fun listPublicFairs(lat: Double?, lng: Double?): List<PublicFair> {
        val body = JSONObject().put("p_lat", lat ?: JSONObject.NULL).put("p_lng", lng ?: JSONObject.NULL)
        val rows = client.request("/rest/v1/rpc/upcoming_fairs", "POST", body, false) as JSONArray
        val upcoming = rows.rows { it.toPublicFair() }
        if (upcoming.isNotEmpty()) return upcoming
        val published = (client.request("/rest/v1/public_fairs?select=*&status=eq.published&order=starts_at.desc") as JSONArray)
            .rows { it.toPublicFair() }
        if (lat == null || lng == null) return published
        fun haversineKm(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
            val r = 6371.0
            val dLat = Math.toRadians(bLat - aLat)
            val dLng = Math.toRadians(bLng - aLng)
            val s = kotlin.math.sin(dLat / 2) * kotlin.math.sin(dLat / 2) +
                kotlin.math.cos(Math.toRadians(aLat)) * kotlin.math.cos(Math.toRadians(bLat)) *
                kotlin.math.sin(dLng / 2) * kotlin.math.sin(dLng / 2)
            return r * 2.0 * kotlin.math.atan2(kotlin.math.sqrt(s), kotlin.math.sqrt(1.0 - s))
        }
        return published.map { it.copy(distanceKm = haversineKm(lat, lng, it.latitude, it.longitude)) }
            .sortedBy { it.distanceKm }
    }
    override suspend fun listFairParticipants(fairId: String): List<FairParticipant> {
        if (fairId.isBlank()) return emptyList()
        val shopsById = runCatching { listPublicShops() }.getOrDefault(emptyList()).associateBy { it.id }
        val remoteParticipants = runCatching {
            val rows = client.request(
                "/rest/v1/fair_participants?select=fair_id,shop_id,status&fair_id=eq.${SupabaseClient.encode(fairId)}"
            ) as JSONArray
            (0 until rows.length()).mapNotNull { index ->
                val row = rows.optJSONObject(index) ?: return@mapNotNull null
                val status = FairParticipantStatus.from(row.optString("status")) ?: return@mapNotNull null
                val shopId = row.optString("shop_id")
                if (shopId.isBlank()) return@mapNotNull null
                val shop = shopsById[shopId]
                FairParticipant(
                    fairId = row.optString("fair_id", fairId),
                    shopId = shopId,
                    shopName = shop?.name?.ifBlank { "Tienda confirmada" } ?: "Tienda confirmada",
                    status = status,
                    sector = shop?.sector.orEmpty(),
                    entrepreneurType = shop?.entrepreneurType.orEmpty()
                )
            }
        }.getOrDefault(emptyList())
        val byShop = remoteParticipants.associateBy { it.shopId }.toMutableMap()
        val candidateShopIds = (shopsById.keys + listOfNotNull(client.cachedProfile()?.shopId)).toSet()
        for (sId in candidateShopIds) {
            val localStatus = readLocalFairDecisions(sId)[fairId] ?: continue
            val shop = shopsById[sId]
            val existing = byShop[sId]
            byShop[sId] = FairParticipant(
                fairId = fairId,
                shopId = sId,
                shopName = existing?.shopName ?: shop?.name?.ifBlank { "Tienda confirmada" } ?: "Tienda confirmada",
                status = localStatus,
                sector = existing?.sector ?: shop?.sector.orEmpty(),
                entrepreneurType = existing?.entrepreneurType ?: shop?.entrepreneurType.orEmpty()
            )
        }
        return byShop.values.toList()
    }
    override suspend fun listOwnerFairCalendar(shopId: String): List<OwnerFairCalendarItem> {
        if (shopId.isBlank()) return emptyList()
        val remoteFairs = runCatching { listPublicFairs(null, null) }.getOrDefault(emptyList())
        val fairs = if (remoteFairs.isNotEmpty()) remoteFairs else defaultPlatformFairs()
        val remoteStatuses = runCatching {
            val rows = client.request(
                "/rest/v1/fair_participants?select=fair_id,status&shop_id=eq.${SupabaseClient.encode(shopId)}",
                authenticated = true
            ) as JSONArray
            buildMap {
                for (i in 0 until rows.length()) {
                    val row = rows.optJSONObject(i) ?: continue
                    val fId = row.optString("fair_id")
                    val st = FairParticipantStatus.from(row.optString("status"))
                    if (fId.isNotBlank() && st != null) put(fId, st)
                }
            }
        }.getOrDefault(emptyMap())
        val merged = remoteStatuses + readLocalFairDecisions(shopId)
        return buildOwnerFairCalendar(fairs, merged, shopId)
    }
    override suspend fun respondToFairInvitation(shopId: String, fairId: String, participate: Boolean): FairParticipantStatus {
        require(shopId.isNotBlank() && fairId.isNotBlank()) { "Identificador de tienda o feria inválido" }
        val nextStatus = applyOneTapFairDecision(participate)
        writeLocalFairDecision(shopId, fairId, nextStatus)
        runCatching {
            val payload = JSONObject()
                .put("fair_id", fairId)
                .put("shop_id", shopId)
                .put("status", nextStatus.wire)
            client.request(
                "/rest/v1/fair_participants?on_conflict=fair_id,shop_id",
                "POST",
                payload,
                true,
                "resolution=merge-duplicates"
            )
        }
        return nextStatus
    }
    override suspend fun getAnonymousNavigation(): String {
        val rows = client.request("/rest/v1/platform_settings?select=anonymous_navigation&id=eq.true") as JSONArray
        return rows.optJSONObject(0)?.optString("anonymous_navigation")?.takeIf { it in listOf("allow", "invite", "require") } ?: "allow"
    }
    override suspend fun listShopAssociations(shopId: String): List<String> {
        val links = client.request("/rest/v1/shop_associations?select=association_id&shop_id=eq.${SupabaseClient.encode(shopId)}") as JSONArray
        val ids = (0 until links.length()).mapNotNull { links.optJSONObject(it)?.optString("association_id")?.takeIf(String::isNotBlank) }.toSet()
        if (ids.isEmpty()) return emptyList()
        val rows = client.request("/rest/v1/associations?select=id,name,active&active=eq.true&order=name") as JSONArray
        return (0 until rows.length()).mapNotNull { index ->
            val row = rows.optJSONObject(index) ?: return@mapNotNull null
            row.optString("name").takeIf { it.isNotBlank() && row.optString("id") in ids }
        }
    }
    override suspend fun updateShop(shop: Shop) {
        writeLocalAllowRatings(shop.id, shop.allowRatings)
        val baseBody = JSONObject().put("name", shop.name).put("description", shop.description).put("logo_url", shop.logoUrl ?: JSONObject.NULL)
            .put("entrepreneur_type", shop.entrepreneurType).put("sector", shop.sector).put("contact", shop.contact).put("show_prices", shop.showPrices)
            .put("contact_mode", shop.contactMode.wire).put("whatsapp_number", shop.whatsappNumber)
            .put("pickup_label", shop.pickupLabel)
            .put("pickup_lat", shop.pickupLat ?: JSONObject.NULL)
            .put("pickup_lng", shop.pickupLng ?: JSONObject.NULL)
        val bodyWithRatings = JSONObject(baseBody.toString()).put("allow_ratings", shop.allowRatings)
        val rows = try {
            client.request("/rest/v1/shops?id=eq.${SupabaseClient.encode(shop.id)}", "PATCH", bodyWithRatings, true, "return=representation") as JSONArray
        } catch (error: BackendException) {
            if (error.status != 400) throw error
            client.request("/rest/v1/shops?id=eq.${SupabaseClient.encode(shop.id)}", "PATCH", baseBody, true, "return=representation") as JSONArray
        }
        if (rows.length() == 0) throw BackendException(403, "No tienes permiso para editar esta tienda")
    }
    override suspend fun uploadLogo(shopId: String, jpegBytes: ByteArray): String {
        val url = client.upload(shopId, "logo", jpegBytes)
        val rows = client.request("/rest/v1/shops?id=eq.${SupabaseClient.encode(shopId)}", "PATCH", JSONObject().put("logo_url", url), true, "return=representation") as JSONArray
        if (rows.length() == 0) throw BackendException(403, "No tienes permiso para editar esta tienda")
        return url
    }
}
class SupabaseProductRepository(private val client: SupabaseClient) : ProductRepository {
    private fun owner() = client.uid() ?: throw BackendException(401, "Inicia sesion para continuar")
    private fun pending(uid: String, shop: String) = "owner:$uid:pending:$shop"
    private suspend fun send(document: JSONObject) { client.request("/rest/v1/products?on_conflict=id", "POST", document, true, "resolution=merge-duplicates") }
    /** Dan puede restaurar el editor con estos borradores al volver a abrir la pantalla. */
    fun pendingDrafts(shopId: String): List<OwnerProduct> {
        val documents = JSONObject(client.store.read(pending(owner(), shopId)) ?: "{}")
        return documents.keys().asSequence().map { documents.getJSONObject(it).toOwnerProduct() }.toList()
    }
    /** La cola esta cifrada y solo se envia con la misma cuenta propietaria. */
    suspend fun flushPending(shopId: String) = client.productWriteLock.withLock {
        val uid = owner(); val key = pending(uid, shopId)
        val documents = JSONObject(client.store.read(key) ?: "{}")
        for (id in documents.keys().asSequence().toList()) {
            if (client.uid() != uid) return@withLock
            try { send(documents.getJSONObject(id)); documents.remove(id); client.store.write(key, documents.toString()) }
            catch (_: IOException) { return@withLock }
        }
    }
    override fun ownerProducts(shopId: String): Flow<List<OwnerProduct>> = flow {
        val uid = owner(); val key = "owner:$uid:cache:products:$shopId"
        client.store.read(key)?.let { emit(JSONArray(it).rows { row -> row.toOwnerProduct() }) }
        while (currentCoroutineContext().isActive && client.uid() == uid) {
            try {
                flushPending(shopId)
                val rows = client.request("/rest/v1/products?select=*&shop_id=eq.${SupabaseClient.encode(shopId)}&order=name", authenticated = true) as JSONArray
                if (client.uid() != uid) break
                client.store.write(key, rows.toString()); emit(rows.rows { it.toOwnerProduct() })
            } catch (_: IOException) { /* La cache y los borradores se conservan cifrados. */ }
            delay(15000)
        }
        emit(emptyList())
    }
    override suspend fun saveProduct(product: OwnerProduct): Unit = client.productWriteLock.withLock {
        require(product.base.name.isNotBlank() && product.base.priceClp >= 0) { "Revisa el nombre y el precio" }
        require(product.base.quantity == null || product.base.quantity >= 0) { "La cantidad no puede ser negativa" }
        val uid = owner(); val key = pending(uid, product.base.shopId); val document = product.toSupabase()
        try { send(document) }
        catch (_: IOException) {
            val queue = JSONObject(client.store.read(key) ?: "{}"); queue.put(product.base.id, document); client.store.write(key, queue.toString())
            throw PendingProductException()
        }
        val queue = JSONObject(client.store.read(key) ?: "{}"); queue.remove(product.base.id); client.store.write(key, queue.toString())
    }
    override suspend fun deleteProduct(shopId: String, productId: String): Unit = client.productWriteLock.withLock {
        val rows = client.request("/rest/v1/products?id=eq.${SupabaseClient.encode(productId)}&shop_id=eq.${SupabaseClient.encode(shopId)}", "DELETE", authenticated = true, prefer = "return=representation") as JSONArray
        if (rows.length() == 0) throw BackendException(403, "No pudimos borrar ese producto")
        val key = pending(owner(), shopId); val queue = JSONObject(client.store.read(key) ?: "{}"); queue.remove(productId); client.store.write(key, queue.toString())
    }
    override suspend fun uploadPhoto(shopId: String, productId: String, jpegBytes: ByteArray) = client.upload(shopId, "products/$productId", jpegBytes)
}
class SupabaseSalesRepository(private val client: SupabaseClient) : SalesRepository {
    override suspend fun registerSale(shopId: String, productId: String, variantId: String?, quantity: Int, place: String) {
        require(quantity > 0) { "La cantidad debe ser mayor que cero" }
        val uid = client.uid() ?: throw BackendException(401, "Inicia sesion para continuar")
        val fingerprint = JSONArray().put(shopId).put(productId).put(variantId ?: JSONObject.NULL).put(quantity).put(place).toString()
        val hash = MessageDigest.getInstance("SHA-256").digest(fingerprint.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val key = "owner:$uid:sale:$hash"
        val requestId = client.store.read(key) ?: UUID.randomUUID().toString().also { client.store.write(key, it) }
        val body = JSONObject().put("p_shop_id", shopId).put("p_product_id", productId).put("p_variant_id", variantId ?: JSONObject.NULL)
            .put("p_quantity", quantity).put("p_place", place).put("p_request_id", requestId)
        try { client.request("/rest/v1/rpc/register_sale", "POST", body, true); client.store.remove(key) }
        catch (e: BackendException) {
            if (e.status in 400..499 && e.status !in listOf(408, 429)) client.store.remove(key)
            throw e
        }
        // Si se pierde la respuesta, un reintento con los mismos datos reutiliza el recibo.
    }
    override fun history(shopId: String): Flow<List<Sale>> = flow {
        val uid = client.uid() ?: throw BackendException(401, "Inicia sesion para continuar")
        val key = "owner:$uid:cache:sales:$shopId"
        client.store.read(key)?.let { emit(JSONArray(it).rows { row -> row.toSale() }) }
        while (currentCoroutineContext().isActive && client.uid() == uid) {
            try {
                val rows = client.request("/rest/v1/sales?select=*&shop_id=eq.${SupabaseClient.encode(shopId)}&order=date_millis.desc", authenticated = true) as JSONArray
                if (client.uid() != uid) break
                client.store.write(key, rows.toString()); emit(rows.rows { it.toSale() })
            } catch (_: IOException) { /* Lectura de cache privada mientras vuelve la red. */ }
            delay(15000)
        }
        emit(emptyList())
    }
}
