package cl.surcode.conectasur.domain

/** Devuelve el mensaje de error si la venta no se puede registrar, o null si es valida. */
fun OwnerProduct.saleError(variantId: String?, quantity: Int?): String? {
    if (quantity == null || quantity <= 0) return "Escribe una cantidad mayor que cero."
    if (variants.isNotEmpty() && variants.none { it.id == variantId }) return "Elige una opción del producto."
    val tracksUnits = base.stockMode == StockMode.UNITS || base.stockMode == StockMode.UNIQUE
    val orderWhenEmpty = base.stockMode == StockMode.UNITS && base.quantity == 0 && base.soldOut == "ORDER"
    if (!tracksUnits || orderWhenEmpty) return null
    val available = variants.firstOrNull { it.id == variantId }?.quantity ?: base.quantity ?: 0
    return if (quantity > available) "No tienes suficientes unidades. Revisa la cantidad." else null
}
