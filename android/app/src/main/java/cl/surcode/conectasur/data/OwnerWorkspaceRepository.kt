package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import org.json.JSONArray
import java.io.IOException

/** Caché y cola de trabajo por cuenta; ninguna pantalla conoce rutas SQL/REST. */
class OwnerWorkspaceRepository(private val client: SupabaseClient) {
    data class Snapshot(val products: List<OwnerProduct>, val offline: Boolean, val pending: Int)
    private fun prefix(shop: String): String {
        val profile = client.cachedProfile() ?: throw BackendException(401, "Ingresa nuevamente a Mi tienda.")
        require(profile.role == Role.EMPRENDEDORA && profile.shopId == shop) { "Esta tienda no pertenece a tu cuenta." }
        return "owner:${profile.uid}:workspace:$shop:"
    }
    private fun read(key: String) = JSONObject(client.store.read(key) ?: "{}")
    fun draft(shop: String): JSONObject? = client.store.read(prefix(shop)+"draft")?.let(::JSONObject)
    fun saveDraft(shop: String, data: JSONObject) { client.store.write(prefix(shop)+"draft", data.toString()) }
    fun discardDraft(shop: String) { client.store.remove(prefix(shop)+"draft") }
    fun saleDraft(shop: String): JSONObject? = client.store.read(prefix(shop)+"sale-draft")?.let(::JSONObject)
    fun saveSaleDraft(shop: String, data: JSONObject) { client.store.write(prefix(shop)+"sale-draft",data.toString()) }
    fun clearSaleDraft(shop: String) { client.store.remove(prefix(shop)+"sale-draft") }
    fun configuration(shop: String) = read(prefix(shop)+"settings").let {
        if (!it.has("default_products")) it.put("default_products", JSONObject().put("stockMode","UNITS").put("soldOut","HIDE").put("visible",true).put("showPrice",true))
        if (!it.has("history_enabled")) it.put("history_enabled",true)
        it
    }
    suspend fun refreshConfiguration(shop: String): JSONObject {
        val key=prefix(shop)+"settings"
        return try {
            val rows=client.request("/rest/v1/shops?select=history_enabled,default_products&id=eq.${SupabaseClient.encode(shop)}", authenticated=true) as JSONArray
            val value=rows.optJSONObject(0) ?: throw BackendException(403,"No encontramos tu tienda activa.")
            client.store.write(key,value.toString());value
        } catch (_: IOException) { configuration(shop) }
    }
    suspend fun saveConfiguration(shop: String, config: JSONObject) {
        val rows=client.request("/rest/v1/shops?id=eq.${SupabaseClient.encode(shop)}","PATCH",config,true,"return=representation") as JSONArray
        if(rows.length()==0)throw BackendException(403,"No tienes permiso para cambiar esta tienda.")
        client.store.write(prefix(shop)+"settings", config.toString())
    }
    private fun applyLocal(shop: String, rows: List<OwnerProduct>): List<OwnerProduct> {
        val key=prefix(shop);val pending=read(key+"pending");val deleted=read(key+"deleted")
        val result=rows.filter { !deleted.has(it.base.id) }.associateBy {it.base.id}.toMutableMap()
        for(id in pending.keys())result[id]=pending.getJSONObject(id).toOwnerProduct()
        return result.values.sortedBy {it.base.name.lowercase()}
    }
    fun cached(shop: String): List<OwnerProduct> = applyLocal(shop, JSONArray(client.store.read(prefix(shop)+"cache")?:"[]").rows {it.toOwnerProduct()})
    private fun remember(shop: String, rows: List<OwnerProduct>) { client.store.write(prefix(shop)+"cache",JSONArray().apply {rows.forEach {put(it.toSupabase())}}.toString()) }
    suspend fun sync(shop: String): Snapshot = client.productWriteLock.withLock {
        val key=prefix(shop);val edits=read(key+"pending");val deleted=read(key+"deleted")
        try {
            for(id in deleted.keys().asSequence().toList()) {
                client.request("/rest/v1/products?id=eq.${SupabaseClient.encode(id)}&shop_id=eq.${SupabaseClient.encode(shop)}","DELETE",authenticated=true)
                deleted.remove(id);client.store.write(key+"deleted",deleted.toString())
            }
            for(id in edits.keys().asSequence().toList()) {
                val doc=uploadLocalPhotos(shop,edits.getJSONObject(id))
                // Guardar URL confirmada evita volver a subir las fotos al reintentar.
                edits.put(id,doc);client.store.write(key+"pending",edits.toString())
                client.request("/rest/v1/products?on_conflict=id","POST",doc,true,"resolution=merge-duplicates")
                edits.remove(id);client.store.write(key+"pending",edits.toString())
            }
            val rows=(client.request("/rest/v1/products?select=*&shop_id=eq.${SupabaseClient.encode(shop)}&order=name",authenticated=true) as JSONArray).rows {it.toOwnerProduct()}
            remember(shop,rows);Snapshot(applyLocal(shop,rows),false,edits.length()+deleted.length())
        }catch(cancelled: CancellationException){throw cancelled}
        catch(_: IOException){Snapshot(cached(shop),true,edits.length()+deleted.length())}
    }
    private suspend fun uploadLocalPhotos(shop: String, doc: JSONObject): JSONObject {
        suspend fun photo(value: String): String = if(value.startsWith("data:image/jpeg;base64,"))
            client.upload(shop,"products/${doc.getString("id")}",android.util.Base64.decode(value.substringAfter(','),android.util.Base64.NO_WRAP)) else value
        doc.put("photo",photo(doc.optString("photo")))
        val variants=doc.getJSONArray("variants")
        for(i in 0 until variants.length()) { val v=variants.getJSONObject(i);v.nullableString("photo")?.let {v.put("photo",photo(it))} }
        return doc
    }
    suspend fun save(shop: String, item: OwnerProduct): Snapshot {
        require(item.base.shopId==shop && item.base.name.isNotBlank())
        client.productWriteLock.withLock {
            val key=prefix(shop);val edits=read(key+"pending");edits.put(item.base.id,item.toSupabase());client.store.write(key+"pending",edits.toString())
            val deleted=read(key+"deleted");deleted.remove(item.base.id);client.store.write(key+"deleted",deleted.toString())
        }
        return sync(shop)
    }
    suspend fun delete(shop: String,id: String): Snapshot {
        client.productWriteLock.withLock {
            val key=prefix(shop);val edits=read(key+"pending");edits.remove(id);client.store.write(key+"pending",edits.toString())
            val deleted=read(key+"deleted");deleted.put(id,true);client.store.write(key+"deleted",deleted.toString())
        }
        return sync(shop)
    }
    suspend fun bulk(shop: String, ids: Set<String>, category: String?, settings: JSONObject, all: Boolean): Snapshot {
        // Una sola transacción cuando hay red; el catálogo visible nunca queda a medio cambiar.
        val result=sync(shop)
        if(!result.offline) {
            val body=JSONObject().put("p_shop_id",shop).put("p_ids",if(all||category!=null)JSONObject.NULL else JSONArray(ids.toList()))
                .put("p_category",category?:JSONObject.NULL).put("p_settings",settings)
            try { client.request("/rest/v1/rpc/set_product_availability","POST",body,true);return sync(shop) }
            catch(_:IOException){ /* La siguiente sección conserva los cambios locales por producto. */ }
        }
        client.productWriteLock.withLock {
            val key=prefix(shop)+"pending";val edits=read(key)
            result.products.filter { all || (category!=null && it.base.category==category) || it.base.id in ids }.forEach {p->
                val doc=p.toSupabase();for(field in settings.keys())doc.put(field,settings.get(field));edits.put(p.base.id,doc)
            }
            client.store.write(key,edits.toString())
        }
        return sync(shop)
    }
    suspend fun sales(shop: String): List<Sale> {
        val key=prefix(shop)+"sales"
        return try {
            val rows=client.request("/rest/v1/sales?select=*&shop_id=eq.${SupabaseClient.encode(shop)}&order=date_millis.desc",authenticated=true) as JSONArray
            client.store.write(key,rows.toString());rows.rows {it.toSale()}
        }catch(_:IOException){JSONArray(client.store.read(key)?:"[]").rows {it.toSale()}}
    }
}