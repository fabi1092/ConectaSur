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
class SupabaseAuthRepository(private val client: SupabaseClient) : AuthRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    override suspend fun signIn(email: String, password: String) = client.signIn(email, password)
    override suspend fun currentSession() = client.currentSession()
    override fun signOut() { scope.launch(start = CoroutineStart.UNDISPATCHED) { client.signOut() } }
    override fun googleSignInUrl(redirectTo: String) = client.googleOAuthUrl(redirectTo)
    override suspend fun isGoogleEnabled() = client.isGoogleOAuthEnabled()
    override suspend fun completeOAuth(accessToken: String, refreshToken: String, expiresIn: Long) =
        client.completeOAuthSession(accessToken, refreshToken, expiresIn)
}
class SupabaseShopRepository(private val client: SupabaseClient) : ShopRepository {
    override suspend fun getShop(shopId: String) = (client.request("/rest/v1/public_shops?select=*&id=eq.${SupabaseClient.encode(shopId)}") as JSONArray).optJSONObject(0)?.toShop()
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
        val body = JSONObject().put("name", shop.name).put("description", shop.description).put("logo_url", shop.logoUrl ?: JSONObject.NULL)
            .put("entrepreneur_type", shop.entrepreneurType).put("sector", shop.sector).put("contact", shop.contact).put("show_prices", shop.showPrices)
        val rows = client.request("/rest/v1/shops?id=eq.${SupabaseClient.encode(shop.id)}", "PATCH", body, true, "return=representation") as JSONArray
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
