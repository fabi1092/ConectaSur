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
    override suspend fun getShop(shopId: String): Shop? {
        if (client.uid() != null && client.cachedProfile()?.shopId == shopId) {
            val privateRow = runCatching {
                (client.request("/rest/v1/shops?select=*&id=eq.${SupabaseClient.encode(shopId)}", authenticated = true) as JSONArray).optJSONObject(0)
            }.getOrNull()
            if (privateRow != null) return privateRow.toShopWithLocalFallback()
        }
        return (client.request("/rest/v1/public_shops?select=*&id=eq.${SupabaseClient.encode(shopId)}") as JSONArray)
            .optJSONObject(0)?.toShopWithLocalFallback()
    }
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
            val detail = client.request(
                "/rest/v1/rpc/fair_public_detail",
                "POST",
                JSONObject().put("p_fair_id", fairId),
                false
            ) as? JSONObject
            val participants = detail?.optJSONArray("participants") ?: JSONArray()
            (0 until participants.length()).mapNotNull { index ->
                val row = participants.optJSONObject(index) ?: return@mapNotNull null
                val kind = row.optString("kind")
                val id = row.optString("id")
                if (id.isBlank()) return@mapNotNull null
                if (kind == "association") {
                    return@mapNotNull FairParticipant(
                        fairId = fairId,
                        shopId = id,
                        shopName = row.optString("name").ifBlank { "Asociación confirmada" },
                        status = FairParticipantStatus.CONFIRMED,
                        sector = row.optString("sector"),
                        entrepreneurType = "Asociación",
                        sampleProducts = emptyList(),
                        isAssociation = true
                    )
                }
                if (kind != "shop") return@mapNotNull null
                val shop = shopsById[id]
                val sampleArray = row.optJSONArray("sample")
                val sampleProducts = if (sampleArray != null) {
                    (0 until sampleArray.length()).mapNotNull { pIdx ->
                        val p = sampleArray.optJSONObject(pIdx) ?: return@mapNotNull null
                        val pId = p.optString("id")
                        if (pId.isBlank()) return@mapNotNull null
                        PublicProduct(
                            id = pId,
                            shopId = id,
                            name = p.optString("name"),
                            description = "",
                            category = "",
                            priceClp = p.nullableLong("price_clp"),
                            onRequest = false,
                            photo = p.optString("photo")
                        )
                    }
                } else emptyList()
                FairParticipant(
                    fairId = fairId,
                    shopId = id,
                    shopName = row.optString("name").ifBlank { shop?.name.orEmpty() }.ifBlank { "Tienda confirmada" },
                    status = FairParticipantStatus.CONFIRMED,
                    sector = shop?.sector.orEmpty(),
                    entrepreneurType = row.optString("entrepreneur_type").ifBlank { shop?.entrepreneurType.orEmpty() },
                    sampleProducts = sampleProducts,
                    isAssociation = false
                )
            }
        }.getOrDefault(emptyList())
        val byShop = remoteParticipants.associateBy { "${it.isAssociation}:${it.shopId}" }.toMutableMap()
        val candidateShopIds = (shopsById.keys + listOfNotNull(client.cachedProfile()?.shopId)).toSet()
        for (sId in candidateShopIds) {
            val localStatus = readLocalFairDecisions(sId)[fairId] ?: continue
            val shop = shopsById[sId]
            val key = "false:$sId"
            val existing = byShop[key]
            byShop[key] = FairParticipant(
                fairId = fairId,
                shopId = sId,
                shopName = existing?.shopName ?: shop?.name?.ifBlank { "Tienda confirmada" } ?: "Tienda confirmada",
                status = localStatus,
                sector = existing?.sector ?: shop?.sector.orEmpty(),
                entrepreneurType = existing?.entrepreneurType ?: shop?.entrepreneurType.orEmpty(),
                sampleProducts = existing?.sampleProducts.orEmpty(),
                isAssociation = false
            )
        }
        return byShop.values.toList()
    }
    override suspend fun listOwnerFairCalendar(shopId: String): List<OwnerFairCalendarItem> {
        if (shopId.isBlank()) return emptyList()
        val localDecisions = readLocalFairDecisions(shopId)
        val remoteRows = runCatching {
            client.request("/rest/v1/rpc/my_fair_invitations", "POST", JSONObject(), true) as JSONArray
        }.getOrNull()
        if (remoteRows != null) {
            return (0 until remoteRows.length()).mapNotNull { i ->
                val row = remoteRows.optJSONObject(i) ?: return@mapNotNull null
                val fairId = row.optString("fair_id")
                if (fairId.isBlank()) return@mapNotNull null
                val fairStatus = row.optString("fair_status", "published")
                if (fairStatus == "cancelled") return@mapNotNull null
                val status = FairParticipantStatus.from(row.optString("my_status"))
                    ?: localDecisions[fairId]
                    ?: FairParticipantStatus.INVITED
                writeLocalFairDecision(shopId, fairId, status)
                OwnerFairCalendarItem(
                    fair = PublicFair(
                        id = fairId,
                        name = row.optString("name"),
                        description = row.optString("description"),
                        imageUrl = row.nullableString("image_url"),
                        placeName = row.optString("place_name"),
                        latitude = row.optDouble("latitude", -41.4693),
                        longitude = row.optDouble("longitude", -72.9424),
                        startsAt = row.optString("starts_at"),
                        endsAt = row.optString("ends_at"),
                        organizer = "",
                        status = fairStatus
                    ),
                    shopId = shopId,
                    status = status
                )
            }.sortedWith(compareBy({ it.fair.startsAt }, { it.fair.name.lowercase() }))
        }
        val remoteFairs = runCatching { listPublicFairs(null, null) }.getOrDefault(emptyList())
        val fallbackFairs = if (remoteFairs.isNotEmpty()) remoteFairs else defaultPlatformFairs()
        return fallbackFairs.mapNotNull { fair ->
            val st = localDecisions[fair.id] ?: return@mapNotNull null
            OwnerFairCalendarItem(fair = fair, shopId = shopId, status = st)
        }.sortedWith(compareBy({ it.fair.startsAt }, { it.fair.name.lowercase() }))
    }
    override suspend fun respondToFairInvitation(shopId: String, fairId: String, participate: Boolean): FairParticipantStatus {
        require(shopId.isNotBlank() && fairId.isNotBlank()) { "Identificador de tienda o feria inválido" }
        val result = try {
            client.request(
                "/rest/v1/rpc/respond_fair_invitation",
                "POST",
                JSONObject().put("p_fair_id", fairId).put("p_participate", participate),
                true
            )
        } catch (error: BackendException) {
            val msg = error.message.orEmpty()
            if (error.status == 403 && (msg.contains("invitada", ignoreCase = true) || msg.contains("dueña", ignoreCase = true))) {
                throw IllegalStateException(msg)
            }
            throw error
        }
        val confirmedStatus = FairParticipantStatus.from(result.toString().trim().trim('"'))
            ?: applyOneTapFairDecision(participate)
        writeLocalFairDecision(shopId, fairId, confirmedStatus)
        return confirmedStatus
    }
    override suspend fun suggestFairsForSale(shopId: String, lat: Double?, lng: Double?): List<FairSaleSuggestion> {
        if (shopId.isBlank()) return emptyList()
        return runCatching {
            val body = JSONObject()
                .put("p_shop_id", shopId)
                .put("p_lat", lat ?: JSONObject.NULL)
                .put("p_lng", lng ?: JSONObject.NULL)
            val rows = client.request("/rest/v1/rpc/suggest_fairs_for_sale", "POST", body, true) as JSONArray
            (0 until rows.length()).mapNotNull { i ->
                val row = rows.optJSONObject(i) ?: return@mapNotNull null
                val fairId = row.optString("fair_id")
                val name = row.optString("name")
                if (fairId.isBlank() || name.isBlank()) return@mapNotNull null
                val inProgress = row.optBoolean("in_progress", false)
                val distKm = row.nullableDouble("distance_km")
                val fair = PublicFair(
                    id = fairId,
                    name = name,
                    description = "",
                    imageUrl = null,
                    placeName = row.optString("place_name"),
                    latitude = 0.0,
                    longitude = 0.0,
                    startsAt = row.optString("starts_at"),
                    endsAt = row.optString("ends_at"),
                    organizer = "",
                    status = "published",
                    distanceKm = distKm
                )
                val nearGps = inProgress && distKm != null && distKm <= 3.0
                val reason = if (nearGps) FairSuggestionReason.IN_PROGRESS_NEARBY_GPS else FairSuggestionReason.CONFIRMED_SAME_DAY
                val label = if (nearGps) {
                    val distText = String.format(java.util.Locale.US, "%.1f km", distKm)
                    "Sugerida por tu ubicación: $name ($distText, en curso)"
                } else {
                    "Feria confirmada para hoy: $name"
                }
                FairSaleSuggestion(fair = fair, reason = reason, distanceKm = distKm, label = label)
            }
        }.getOrDefault(emptyList())
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
        val bodyWithRatings = JSONObject(baseBody.toString())
            .put("allow_ratings", shop.allowRatings)
            .put("contact_notifications", shop.contactNotifications)
            .put("notify_from", shop.notifyFrom.take(5).ifBlank { "08:00" })
            .put("notify_until", shop.notifyUntil.take(5).ifBlank { "21:00" })
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

private suspend fun callBuyerRpc(
    client: SupabaseClient,
    firebaseToken: suspend () -> String?,
    rpcName: String,
    body: JSONObject
): Any {
    val hasSupabaseSession = client.uid() != null
    if (!hasSupabaseSession) {
        val token = firebaseToken()
        if (!token.isNullOrBlank()) body.put("p_token", token)
    }
    return client.request("/rest/v1/rpc/$rpcName", "POST", body, authenticated = hasSupabaseSession)
}

class SupabasePushRepository(
    private val client: SupabaseClient,
    private val firebaseToken: suspend () -> String?
) : PushRepository {
    override suspend fun setNotificationConsent(granted: Boolean) {
        callBuyerRpc(client, firebaseToken, "set_notification_consent", JSONObject().put("p_granted", granted))
    }

    override suspend fun registerDeviceToken(token: String, platform: String) {
        if (token.isBlank()) return
        callBuyerRpc(
            client,
            firebaseToken,
            "register_device",
            JSONObject().put("p_fcm_token", token).put("p_platform", platform)
        )
    }

    override suspend fun unregisterDeviceToken(token: String) {
        if (token.isBlank()) return
        callBuyerRpc(client, firebaseToken, "unregister_device", JSONObject().put("p_fcm_token", token))
    }

    override suspend fun listNotifications(limit: Int): List<AppNotification> {
        val rows = callBuyerRpc(
            client,
            firebaseToken,
            "my_notifications",
            JSONObject().put("p_limit", limit.coerceIn(1, 200))
        ) as? JSONArray ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i ->
            val row = rows.optJSONObject(i) ?: return@mapNotNull null
            val id = row.optString("id")
            if (id.isBlank()) return@mapNotNull null
            val data = row.optJSONObject("data")
            AppNotification(
                id = id,
                kind = row.optString("kind"),
                title = row.optString("title"),
                body = row.optString("body"),
                fairId = data?.nullableString("fair_id"),
                fairName = data?.nullableString("fair_name"),
                shopId = data?.nullableString("shop_id"),
                createdAtMillis = BuyerEngagementStore.parseIsoTimestampMillis(row.nullableString("created_at")),
                readAtMillis = row.nullableString("read_at")?.let {
                    BuyerEngagementStore.parseIsoTimestampMillis(it).takeIf { ms -> ms > 0L }
                }
            )
        }
    }

    override suspend fun markNotificationsRead(ids: List<String>): Int {
        val cleanIds = ids.map { it.trim() }.filter { it.isNotBlank() }
        if (cleanIds.isEmpty()) return 0
        val res = callBuyerRpc(
            client,
            firebaseToken,
            "mark_notifications_read",
            JSONObject().put("p_ids", JSONArray(cleanIds))
        )
        return res.toString().trim().toIntOrNull() ?: 0
    }
}

class SupabaseFollowRepository(
    private val client: SupabaseClient,
    private val firebaseToken: suspend () -> String?,
    private val local: BuyerEngagementStore
) : FollowRepository {
    override suspend fun listFollows(buyerId: String): List<FollowedTarget> {
        val remote = runCatching {
            val rows = callBuyerRpc(client, firebaseToken, "my_follows", JSONObject()) as JSONArray
            (0 until rows.length()).mapNotNull { i ->
                val row = rows.optJSONObject(i) ?: return@mapNotNull null
                val type = FollowTargetType.from(row.optString("target_type")) ?: return@mapNotNull null
                val id = row.optString("target_id")
                if (id.isBlank()) return@mapNotNull null
                FollowedTarget(type, id, row.optString("name").ifBlank { id })
            }
        }.getOrNull()
        if (remote != null && buyerId.isNotBlank()) {
            local.currentFollows(buyerId).forEach { old ->
                if (remote.none { it.targetType == old.targetType && it.targetId == old.targetId }) {
                    local.unfollowLocal(buyerId, old.targetType, old.targetId)
                }
            }
            remote.forEach { item ->
                local.followLocal(buyerId, item.targetType, item.targetId, item.targetName)
            }
            return remote
        }
        return local.currentFollows(buyerId)
    }

    override suspend fun follow(buyerId: String, type: FollowTargetType, id: String, name: String): FollowedTarget {
        val saved = local.followLocal(buyerId, type, id, name)
        runCatching {
            callBuyerRpc(
                client,
                firebaseToken,
                "follow_target",
                JSONObject().put("p_target_type", type.wire).put("p_target_id", id)
            )
        }
        return saved
    }

    override suspend fun unfollow(buyerId: String, type: FollowTargetType, id: String): Boolean {
        val removed = local.unfollowLocal(buyerId, type, id)
        runCatching {
            callBuyerRpc(
                client,
                firebaseToken,
                "unfollow_target",
                JSONObject().put("p_target_type", type.wire).put("p_target_id", id)
            )
        }
        return removed
    }
}

class SupabaseRatingRepository(
    private val client: SupabaseClient,
    private val firebaseToken: suspend () -> String?,
    private val local: BuyerEngagementStore
) : RatingRepository {
    override suspend fun summary(type: RatingTargetType, targetId: String, buyerId: String?, shopId: String): RatingSummary {
        val resolvedShop = if (type == RatingTargetType.SHOP) targetId else shopId
        if (resolvedShop.isBlank()) return local.summaryLocal(type, targetId, buyerId)
        return runCatching {
            val productFilter = if (type == RatingTargetType.PRODUCT) "&product_id=eq.${SupabaseClient.encode(targetId)}" else "&product_id=is.null"
            val avgRows = client.request("/rest/v1/public_ratings?select=average,total&shop_id=eq.${SupabaseClient.encode(resolvedShop)}$productFilter") as JSONArray
            val avgObj = avgRows.optJSONObject(0)
            val average = avgObj?.optDouble("average", 0.0) ?: 0.0
            val total = avgObj?.optInt("total", 0) ?: 0

            val commentsBody = JSONObject().put("p_shop_id", resolvedShop).put("p_limit", 10)
                .put("p_product_id", if (type == RatingTargetType.PRODUCT) targetId else JSONObject.NULL)
            val commentRows = runCatching {
                client.request("/rest/v1/rpc/rating_comments_named", "POST", commentsBody, false) as? JSONArray
            }.getOrNull()
                ?: (client.request("/rest/v1/rpc/rating_comments", "POST", commentsBody, false) as? JSONArray)
                ?: JSONArray()
            val recent = (0 until commentRows.length()).mapNotNull { i ->
                val row = commentRows.optJSONObject(i) ?: return@mapNotNull null
                val stars = row.optInt("stars", 0)
                if (stars !in 1..5) return@mapNotNull null
                val author = BuyerEngagementStore.formatPublicReviewerName(row.optString("author_name"))
                val createdAt = BuyerEngagementStore.parseIsoTimestampMillis(row.optString("created_at"))
                RatingEntry(
                    id = row.optString("id", "$i"),
                    targetType = type,
                    targetId = targetId,
                    score = stars,
                    comment = row.optString("comment"),
                    authorLabel = author,
                    createdAtMillis = createdAt
                )
            }
            val userRating = if (buyerId != null) {
                runCatching {
                    val myRows = callBuyerRpc(client, firebaseToken, "my_ratings", JSONObject().put("p_shop_id", resolvedShop)) as? JSONArray ?: JSONArray()
                    (0 until myRows.length()).mapNotNull { i -> myRows.optJSONObject(i) }
                        .firstOrNull { r ->
                            val pId = r.nullableString("product_id")
                            if (type == RatingTargetType.SHOP) pId == null else pId == targetId
                        }?.let { r ->
                            RatingEntry(
                                id = r.optString("id", "mine"),
                                targetType = type,
                                targetId = targetId,
                                score = r.optInt("stars", 5),
                                comment = r.optString("comment"),
                                authorLabel = "Tu calificación"
                            )
                        }
                }.getOrNull()
            } else null
            RatingSummary(average = average, count = total, userRating = userRating, recent = recent)
        }.getOrElse { local.summaryLocal(type, targetId, buyerId) }
    }

    override suspend fun submit(
        type: RatingTargetType,
        targetId: String,
        score: Int,
        comment: String,
        buyerId: String?,
        authorLabel: String,
        ratingsAllowed: Boolean,
        shopId: String
    ): RatingEntry {
        check(ratingsAllowed) { "Esta tienda desactivó las calificaciones." }
        check(!buyerId.isNullOrBlank()) { "Inicia sesión con Google para dejar tu calificación." }
        val resolvedShop = if (type == RatingTargetType.SHOP) targetId else shopId
        val publicAuthor = BuyerEngagementStore.formatPublicReviewerName(authorLabel)
        val body = JSONObject()
            .put("p_shop_id", resolvedShop)
            .put("p_product_id", if (type == RatingTargetType.PRODUCT) targetId else JSONObject.NULL)
            .put("p_stars", score)
            .put("p_comment", comment.trim().takeIf { it.isNotEmpty() } ?: JSONObject.NULL)
            .put("p_author_name", publicAuthor)
        if (resolvedShop.isNotBlank()) {
            callBuyerRpc(client, firebaseToken, "rate_target_named", body)
        }
        return local.submitRatingLocal(type, targetId, score, comment, buyerId, publicAuthor, ratingsAllowed)
    }
}
