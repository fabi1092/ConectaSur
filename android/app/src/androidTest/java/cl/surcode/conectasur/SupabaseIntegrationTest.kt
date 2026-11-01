package cl.surcode.conectasur

import android.content.Context
import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.HttpURLConnection
import java.net.URLDecoder
import org.json.JSONObject
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

/** Solo se ejecutan con -e supabaseLive true y una cuenta FICTICIA por argumentos del runner. */
@RunWith(AndroidJUnit4::class)
class SupabaseIntegrationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val args get() = InstrumentationRegistry.getArguments()
    private fun client(): SupabaseClient {
        assumeTrue("Prueba real requiere configuracion explicita", args.getString("supabaseLive") == "true")
        return SupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY, SecureBackendStore(context, "supabase_test"))
    }
    private suspend fun login(client: SupabaseClient): Session = client.signIn(
        requireNotNull(args.getString("testEmail")), requireNotNull(args.getString("testPassword")))
    private fun product(id: String, shop: String) = OwnerProduct(CatalogProduct(id, shop, "Prueba Android", "Prueba temporal", "Artesanías",
        8000, true, StockMode.UNITS, 3, true, "flores", "artesania", mapOf("material" to "Lana")))

    @Test fun readsPublicCatalogAndPersistsOfflineCache() = runBlocking {
        val api = client(); val repo = SupabaseCatalogRepository(api)
        repo.refresh()
        assertTrue(repo.publicProducts.value.any { it.id == "flores" && it.priceClp == 8000L })
        assertNull(repo.publicProducts.value.first { it.id == "pedido" }.priceClp)
        val offline = SupabaseCatalogRepository(SupabaseClient("https://127.0.0.1:1", BuildConfig.SUPABASE_ANON_KEY, api.store))
        offline.refresh()
        assertTrue(offline.publicProducts.value.isNotEmpty())
        assertTrue(offline.status.value!!.contains("Sin conexion"))
    }
    @Test fun signsInWritesProductSellsAndSignsOut() = runBlocking {
        val api = client(); val session = login(api)
        assertEquals(Role.EMPRENDEDORA, session.role)
        val shop = requireNotNull(session.shopId); val id = "android_sec_" + UUID.randomUUID()
        val products = SupabaseProductRepository(api)
        try {
            products.saveProduct(product(id, shop))
            val rows = api.request("/rest/v1/products?id=eq.$id", authenticated = true) as JSONArray
            assertEquals(3, rows.getJSONObject(0).getInt("quantity"))
            SupabaseSalesRepository(api).registerSale(shop, id, null, 1, "Prueba Android")
            val sold = api.request("/rest/v1/products?id=eq.$id", authenticated = true) as JSONArray
            assertEquals(2, sold.getJSONObject(0).getInt("quantity"))
            val history = api.request("/rest/v1/sales?product_id=eq.$id", authenticated = true) as JSONArray
            assertEquals(1, history.length())
            val plaintext = context.getSharedPreferences("supabase_test", Context.MODE_PRIVATE).getString("auth", "")!!
            assertFalse(plaintext.contains(session.uid))
            assertFalse(plaintext.contains(api.storedSession()!!.getString("access_token")))
        } finally { products.deleteProduct(shop, id); api.signOut() }
        assertNull(api.currentSession())
    }
    @Test fun keepsOfflineDraftEncryptedAndFlushesWithSameOwner() = runBlocking {
        val api = client(); val session = login(api)
        val shop = requireNotNull(session.shopId); val id = "android_sec_" + UUID.randomUUID()
        val offline = SupabaseProductRepository(SupabaseClient("https://127.0.0.1:1", BuildConfig.SUPABASE_ANON_KEY, api.store))
        try {
            var savedDraft = false
            try { offline.saveProduct(product(id, shop)) } catch (_: PendingProductException) { savedDraft = true }
            assertTrue(savedDraft)
            assertTrue(offline.pendingDrafts(shop).any { it.base.id == id })
            val queueKey = "owner:${session.uid}:pending:$shop"
            assertTrue(api.store.read(queueKey)!!.contains(id))
            val restored = SecureBackendStore(context, "supabase_test")
            assertTrue(restored.read(queueKey)!!.contains(id))
            val live = SupabaseProductRepository(api)
            live.flushPending(shop)
            assertFalse(api.store.read(queueKey)!!.contains(id))
            val rows = api.request("/rest/v1/products?id=eq.$id", authenticated = true) as JSONArray
            assertEquals(1, rows.length())
            live.deleteProduct(shop, id)
        } finally { api.signOut() }
    }
    @Test fun refreshesAnExpiredAccessToken() = runBlocking {
        val api = client(); val session = login(api)
        val saved = api.storedSession()!!.put("expires_at", 0)
        api.store.write("auth", saved.toString())
        assertEquals(session.uid, api.currentSession()!!.uid)
        assertTrue(api.storedSession()!!.getLong("expires_at") > System.currentTimeMillis() / 1000)
        api.signOut()
    }
    @Test fun uploadsAndDownloadsARealJpegThroughNativeRepository() = runBlocking {
        val api = client(); val session = login(api)
        val bitmap = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
        val output = ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output); bitmap.recycle()
        var storedPath: String? = null
        try {
            val url = SupabaseProductRepository(api).uploadPhoto(requireNotNull(session.shopId), "android_sec_" + UUID.randomUUID(), output.toByteArray())
            storedPath = URLDecoder.decode(URI(url).rawPath.substringAfter("/storage/v1/object/public/shop-images/"), "UTF-8")
            val connection = URI(url).toURL().openConnection() as HttpURLConnection
            try {
                connection.setRequestProperty("User-Agent", "ConectaSur-Android/0.3")
                assertEquals(200, connection.responseCode)
                assertTrue(connection.inputStream.use { it.readBytes() }.size > 10)
            } finally { connection.disconnect() }
        } finally {
            storedPath?.let { api.request("/storage/v1/object/shop-images", "DELETE", JSONObject().put("prefixes", JSONArray().put(it)), true) }
            api.signOut()
        }
    }
}
