package cl.surcode.conectasur.domain

val SOLD_OUT_MODES = listOf("HIDE", "SHOW", "ORDER")

val StockMode.countsUnits: Boolean
    get() = this == StockMode.UNITS || this == StockMode.UNIQUE

/** Valores por defecto de la tienda para los próximos productos (A15 / RF-PRO-11). */
data class ProductDefaults(
    val stockMode: StockMode = StockMode.UNITS,
    val soldOut: String = "HIDE",
    val visible: Boolean = true,
    val showPrice: Boolean = true
) {
    init {
        require(soldOut in SOLD_OUT_MODES) { "Elige qué ocurre cuando el producto se agote." }
    }

    fun newCatalogProduct(
        id: String,
        shopId: String,
        category: String = "Artesanías",
        productType: String = "artesania"
    ) = CatalogProduct(
        id = id,
        shopId = shopId,
        name = "",
        description = "",
        category = category,
        priceClp = 0L,
        showPrice = showPrice,
        stockMode = stockMode,
        quantity = if (stockMode.countsUnits) 1 else null,
        visible = visible,
        photo = "",
        productType = productType,
        attributes = emptyMap(),
        soldOut = soldOut
    )

    companion object {
        fun fromValues(
            stockMode: String?,
            soldOut: String?,
            visible: Boolean = true,
            showPrice: Boolean = true
        ) = ProductDefaults(
            stockMode = runCatching { StockMode.valueOf(stockMode.orEmpty()) }.getOrDefault(StockMode.UNITS),
            soldOut = soldOut?.takeIf { it in SOLD_OUT_MODES } ?: "HIDE",
            visible = visible,
            showPrice = showPrice
        )
    }
}

/** Proyección pública completa de un producto con sus variantes, precios y disponibilidad (A06, A08, A09). */
fun OwnerProduct.toPublicOrNull(shopShowPrices: Boolean = true): PublicProduct? {
    val total = if (base.stockMode == StockMode.UNITS && variants.isNotEmpty()) {
        variants.sumOf { it.quantity.coerceAtLeast(0) }
    } else {
        base.quantity
    }
    val showPublicPrice = base.showPrice && shopShowPrices
    val projected = base.copy(quantity = total, showPrice = showPublicPrice).toPublicOrNull() ?: return null
    val publicVariants = variants.map { v ->
        PublicVariant(
            id = v.id,
            label = v.label,
            priceClp = (v.priceClp ?: base.priceClp).takeIf { showPublicPrice },
            photo = v.photo?.takeIf { it.isNotBlank() },
            available = !base.stockMode.countsUnits || v.quantity > 0
        )
    }
    return projected.copy(variants = publicVariants)
}

/** Foto efectiva de una variante pública; usa la foto principal cuando la variante no define una propia (A06). */
fun PublicProduct.variantPhoto(variantId: String?): String =
    variants.firstOrNull { it.id == variantId }?.photo?.takeIf { it.isNotBlank() } ?: photo

/** Valida y normaliza variantes, modalidad, stock y comportamiento al agotarse antes de guardar (A06–A09). */
fun OwnerProduct.validatedForCatalog(): OwnerProduct {
    val name = base.name.trim()
    require(name.length in 1..120) { "Escribe un nombre de hasta 120 letras." }
    require(base.priceClp in 0..9007199254740991L) { "Escribe un precio válido en pesos chilenos." }
    require(base.description.length <= 1000 && base.category.length <= 120) { "La descripción o categoría es demasiado larga." }
    require(base.soldOut in SOLD_OUT_MODES) { "Elige qué hacer cuando el producto se agote." }
    if (base.visible) {
        require(base.photo.isNotBlank()) { "Elige una foto antes de publicar. Puedes conservar el borrador sin publicarlo." }
    }
    require(variants.size <= 20) { "Puedes agregar hasta 20 variantes por producto." }
    require(base.stockMode != StockMode.UNIQUE || variants.isEmpty()) {
        "Una pieza única no tiene variantes. Quita las variantes o elige Regular."
    }
    val ids = mutableSetOf<String>()
    val cleanVariants = variants.map { v ->
        val id = v.id.trim()
        val label = v.label.trim()
        require(id.length in 1..120) { "Cada variante necesita un identificador válido." }
        require(ids.add(id)) { "Hay variantes con el mismo identificador." }
        require(label.length in 1..120) { "Escribe un nombre para cada variante." }
        val amount = if (base.stockMode.countsUnits) v.quantity else 0
        require(amount >= 0) { "Revisa las unidades de cada variante." }
        require(v.priceClp == null || v.priceClp in 0..9007199254740991L) { "El precio de la variante no es válido." }
        Variant(id, label, amount, v.priceClp, v.photo?.trim()?.takeIf { it.isNotBlank() })
    }
    val quantity = when {
        !base.stockMode.countsUnits -> null
        cleanVariants.isNotEmpty() -> {
            val total = cleanVariants.sumOf { it.quantity.toLong() }
            require(total <= Int.MAX_VALUE) { "Demasiadas unidades." }
            total.toInt()
        }
        else -> base.quantity
    }
    require(!base.stockMode.countsUnits || (quantity != null && quantity >= 0)) { "Revisa la cantidad disponible." }
    require(base.stockMode != StockMode.UNIQUE || quantity in 0..1) { "Una pieza única puede tener cero o una unidad." }
    return OwnerProduct(base.copy(name = name, quantity = quantity), cleanVariants)
}
