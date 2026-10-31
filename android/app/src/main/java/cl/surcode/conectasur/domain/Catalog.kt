package cl.surcode.conectasur.domain

import java.text.Normalizer
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.flow.StateFlow

enum class StockMode { UNITS, UNIQUE, ON_REQUEST }
data class CatalogProduct(
    val id: String, val shopId: String, val name: String, val description: String,
    val category: String, val priceClp: Long, val showPrice: Boolean,
    val stockMode: StockMode, val quantity: Int?, val visible: Boolean = true, val photo: String
)
data class PublicProduct(
    val id: String, val shopId: String, val name: String, val description: String,
    val category: String, val priceClp: Long?, val onRequest: Boolean, val photo: String
)
// Public content never includes the private stock count or a hidden price.
fun CatalogProduct.toPublicOrNull(): PublicProduct? {
    if (!visible || (stockMode != StockMode.ON_REQUEST && (quantity ?: 0) <= 0)) return null
    return PublicProduct(id, shopId, name, description, category,
        priceClp.takeIf { showPrice }, stockMode == StockMode.ON_REQUEST, photo)
}
interface CatalogRepository { val publicProducts: StateFlow<List<PublicProduct>> }
private fun normalized(value: String) = Normalizer.normalize(value.trim(), Normalizer.Form.NFD)
    .replace("\\p{M}".toRegex(), "").lowercase(Locale.ROOT)
fun searchProducts(products: List<PublicProduct>, query: String): List<PublicProduct> {
    val words = normalized(query).split("\\s+".toRegex()).filter { it.isNotEmpty() }
    return products.filter { p -> words.all { it in normalized("${p.name} ${p.category} ${p.description}") } }
}
fun priceLabel(pesos: Long?): String = pesos?.let {
    "$" + NumberFormat.getIntegerInstance(Locale.forLanguageTag("es-CL")).format(it) + " CLP"
} ?: "Consultar precio"
fun spokenPrice(pesos: Long?): String = when (pesos) {
    null -> "Consultar precio"
    1L -> "1 peso chileno"
    else -> "$pesos pesos chilenos"
}
