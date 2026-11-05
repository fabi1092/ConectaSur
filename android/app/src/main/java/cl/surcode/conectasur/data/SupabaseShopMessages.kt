package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import org.json.JSONArray
import org.json.JSONObject

class SupabaseShopMessages(private val client: SupabaseClient) : ShopMessageRepository {
    override suspend fun send(id: String, shopId: String, name: String, contact: String, body: String) {
        client.request("/rest/v1/rpc/send_shop_message", "POST", JSONObject().put("p_id", id)
            .put("p_shop_id", shopId).put("p_name", name).put("p_contact", contact).put("p_body", body))
    }
    override suspend fun inbox(shopId: String, before: ShopMessage?): List<ShopMessage> {
        val cursor = before?.let { "&or=" + SupabaseClient.encode("(created_at.lt.${it.createdAt},and(created_at.eq.${it.createdAt},id.lt.${it.id}))") }.orEmpty()
        val rows = client.request("/rest/v1/shop_messages?select=id,shop_id,sender_name,sender_contact,body,created_at,read_at&shop_id=eq.${SupabaseClient.encode(shopId)}&order=created_at.desc,id.desc&limit=50$cursor", authenticated = true) as JSONArray
        return (0 until rows.length()).map { i -> rows.getJSONObject(i).let {
            ShopMessage(it.getString("id"), it.getString("shop_id"), it.getString("sender_name"),
                it.getString("sender_contact"), it.getString("body"), it.getString("created_at"), !it.isNull("read_at"))
        } }
    }
    override suspend fun markRead(id: String) {
        client.request("/rest/v1/rpc/read_shop_message", "POST", JSONObject().put("p_id", id), authenticated = true)
    }
}
