package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.nullableString(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
internal fun JSONObject.nullableLong(key: String) = if (isNull(key)) null else getLong(key)
internal fun JSONObject.attributes(): Map<String, String> = optJSONObject("attributes")?.let { values ->
    values.keys().asSequence().associateWith { values.optString(it) }
}.orEmpty()
internal fun JSONObject.toPublicProduct() = PublicProduct(
    getString("id"), getString("shop_id"), getString("name"), optString("description"), optString("category"),
    nullableLong("price_clp"), optBoolean("on_request"), optString("photo"), optString("product_type"), attributes(),
    optJSONArray("variants")?.let { array -> (0 until array.length()).map { i -> array.getJSONObject(i).let {
        PublicVariant(it.getString("id"), it.getString("label"), it.nullableLong("priceClp"), it.nullableString("photo"), it.optBoolean("available", true))
    } } }.orEmpty(), optBoolean("sold_out")
)
internal fun JSONObject.toOwnerProduct(): OwnerProduct {
    val base = CatalogProduct(getString("id"), getString("shop_id"), getString("name"), optString("description"),
        optString("category"), getLong("price_clp"), getBoolean("show_price"), StockMode.valueOf(getString("stock_mode")),
        if (isNull("quantity")) null else getInt("quantity"), getBoolean("visible"), optString("photo"), optString("product_type"), attributes(), optString("sold_out", "HIDE"))
    val options = getJSONArray("variants")
    return OwnerProduct(base, (0 until options.length()).map { i -> options.getJSONObject(i).let {
        Variant(it.getString("id"), it.getString("label"), it.getInt("quantity"), it.nullableLong("priceClp"), it.nullableString("photo"))
    } })
}
internal fun OwnerProduct.toSupabase(): JSONObject = JSONObject().apply {
    put("id", base.id); put("shop_id", base.shopId); put("name", base.name); put("description", base.description)
    put("category", base.category); put("product_type", base.productType); put("attributes", JSONObject(base.attributes))
    put("price_clp", base.priceClp); put("show_price", base.showPrice); put("stock_mode", base.stockMode.name)
    put("quantity", base.quantity ?: JSONObject.NULL); put("visible", base.visible); put("photo", base.photo)
    put("sold_out", base.soldOut)
    put("variants", JSONArray().apply { variants.forEach { v -> put(JSONObject().put("id", v.id).put("label", v.label).put("quantity", v.quantity)
        .put("priceClp", v.priceClp ?: JSONObject.NULL).put("photo", v.photo ?: JSONObject.NULL)) } })
}
internal fun JSONObject.toShop() = Shop(getString("id"), getString("name"), optString("description"), nullableString("logo_url"),
    optString("entrepreneur_type"), optString("sector"), optString("contact"), getBoolean("show_prices"))
internal fun JSONObject.toSale() = Sale(getString("id"), getString("product_id"), getString("product_name"),
    nullableString("variant_id"), getInt("quantity"), getLong("price_clp"), optString("place"), getLong("date_millis"))
internal fun <T> JSONArray.rows(map: (JSONObject) -> T): List<T> = (0 until length()).map { map(getJSONObject(it)) }
