package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class DemoCatalogRepository : CatalogRepository {
    private val products = listOf(
        CatalogProduct("flores", "demo", "Flores tejidas", "Flores decorativas tejidas a mano. Consulta los colores disponibles. Son artesanías, no plantas vivas.", "Artesanías", 8000, true, StockMode.UNITS, 3, photo="flores"),
        CatalogProduct("bandejas", "demo", "Bandejas decoradas", "Bandejas decorativas para el hogar. Consulta tamaños, materiales y diseños antes de encargar.", "Artesanías", 12000, true, StockMode.UNITS, 2, photo="bandejas"),
        CatalogProduct("pedido", "demo", "Artesanía por encargo", "Una creación hecha a tu gusto. Consulta el diseño y el plazo con la emprendedora.", "Artesanías", 18000, false, StockMode.ON_REQUEST, null, photo="bandejas")
    )
    override val publicProducts: StateFlow<List<PublicProduct>> =
        MutableStateFlow(products.mapNotNull { it.toPublicOrNull() }).asStateFlow()
}
