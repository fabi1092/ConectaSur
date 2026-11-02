package cl.surcode.conectasur.domain

import java.text.Normalizer
import java.text.NumberFormat
import java.util.Locale
import kotlinx.coroutines.flow.StateFlow

enum class StockMode { UNITS, UNIQUE, ON_REQUEST, UNLIMITED }
data class CatalogProduct(
    val id: String, val shopId: String, val name: String, val description: String,
    val category: String, val priceClp: Long, val showPrice: Boolean,
    val stockMode: StockMode, val quantity: Int?, val visible: Boolean = true, val photo: String,
    val productType: String = "", val attributes: Map<String, String> = emptyMap(),
    val soldOut: String = "HIDE"
)
data class PublicVariant(val id: String, val label: String, val priceClp: Long?, val photo: String?, val available: Boolean = true)
data class PublicProduct(
    val id: String, val shopId: String, val name: String, val description: String,
    val category: String, val priceClp: Long?, val onRequest: Boolean, val photo: String,
    val productType: String = "", val attributes: Map<String, String> = emptyMap(),
    val variants: List<PublicVariant> = emptyList(), val soldOut: Boolean = false
)
// Public content never includes the private stock count or a hidden price.
fun CatalogProduct.toPublicOrNull(): PublicProduct? {
    if (!visible || (stockMode == StockMode.UNIQUE && quantity != 1) || (stockMode == StockMode.UNITS && (quantity ?: 0) <= 0 && soldOut == "HIDE")) return null
    return PublicProduct(id, shopId, name, description, category,
        priceClp.takeIf { showPrice }, stockMode == StockMode.ON_REQUEST || (stockMode == StockMode.UNITS && quantity == 0 && soldOut == "ORDER"), photo, productType, attributes, soldOut = stockMode == StockMode.UNITS && quantity == 0 && soldOut == "SHOW")
}
private val emptyCatalogStatus = kotlinx.coroutines.flow.MutableStateFlow<String?>(null)
interface CatalogRepository {
    val publicProducts: StateFlow<List<PublicProduct>>
    val status: StateFlow<String?> get() = emptyCatalogStatus
    suspend fun refresh() {}
}
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
