package cl.surcode.conectasur.domain

/**
 * Pasos del flujo guiado para crear o editar un producto (A01 / RF-PRO-01).
 * Responsable: Benjamín Tampier.
 */
val PRODUCT_EDITOR_STEPS: List<String> = listOf(
    "Foto principal",
    "Datos del producto",
    "Variantes",
    "Disponibilidad y stock",
    "Resumen y publicación"
)

/** Normaliza el paso del borrador dentro del rango válido de los 5 pasos guiados (A01, A11). */
fun coerceEditorStep(step: Int): Int =
    step.coerceIn(0, PRODUCT_EDITOR_STEPS.lastIndex)

/** Avanza o retrocede un paso dentro del flujo guiado (A01). */
fun nextEditorStep(currentStep: Int): Int =
    coerceEditorStep(currentStep + 1)

fun previousEditorStep(currentStep: Int): Int =
    coerceEditorStep(currentStep - 1)

/** Encabezado visible del paso actual en el flujo guiado (A01). */
fun formatEditorStepHeader(step: Int): String {
    val index = coerceEditorStep(step)
    return "Paso ${index + 1} de ${PRODUCT_EDITOR_STEPS.size}: ${PRODUCT_EDITOR_STEPS[index]}"
}

/** Resumen final en el paso de publicación antes de confirmar el guardado (A01). */
fun formatDraftReviewSummary(name: String, priceText: String, variantCount: Int): String {
    val written = priceText.trim().toLongOrNull()?.let { " (${numberToSpanishWords(it)} pesos)" } ?: ""
    return "$name\nPrecio: $priceText pesos chilenos$written\n$variantCount variantes.\nSolo se publicará cuando confirmes Guardar producto."
}

/**
 * Determina si al abrir el editor corresponde recuperar el borrador guardado (A11 / RNF-USA-04).
 * Si la emprendedora interrumpió un alta nueva (requestedProductId == null) o la edición del mismo producto,
 * retoma exactamente lo ya ingresado.
 */
fun shouldResumeDraft(existingDraftId: String?, requestedProductId: String?): Boolean =
    !existingDraftId.isNullOrBlank() && (requestedProductId == null || existingDraftId == requestedProductId)

/**
 * Etiqueta de disponibilidad en el catálogo privado de la emprendedora (A10 / RF-PRO-09, RN-09).
 * Un producto no disponible desaparece de la vitrina pública pero permanece en la tienda de la emprendedora.
 */
fun privateAvailabilityLabel(visible: Boolean): String =
    if (visible) "Disponible" else "No disponible"

/** Formatea la tarjeta de vista previa pública en la app sin exponer cantidades privadas (A16 / RF-PRO-12). */
fun formatPublicPreviewDetails(description: String, publicProduct: PublicProduct?): String {
    val state = when {
        publicProduct?.soldOut == true -> "Agotado"
        publicProduct?.onRequest == true -> "A pedido"
        else -> "Disponible"
    }
    val variantsLine = publicProduct?.variants.orEmpty().joinToString("\n") { variant ->
        val variantState = when {
            publicProduct?.onRequest == true -> "A pedido"
            publicProduct?.soldOut == true || !variant.available -> "Agotado"
            else -> "Disponible"
        }
        "${variant.label} · ${priceLabel(variant.priceClp)} · $variantState"
    }
    return "$state · ${priceLabel(publicProduct?.priceClp)}\n$description\n$variantsLine"
}

/** Formatea la tarjeta del catálogo privado de la emprendedora mostrando stock, modalidad y visibilidad (A10, A16). */
fun formatPrivateCatalogDetails(
    item: OwnerProduct,
    modeLabel: String,
    soldOutLabel: String
): String {
    val p = item.base
    val soldOutInfo = if (p.stockMode == StockMode.UNITS) " · Al agotarse: $soldOutLabel" else ""
    val stockLine = if (p.stockMode.countsUnits) "Stock: ${p.quantity ?: 0}" else "Sin conteo de unidades"
    val variantsLine = if (item.variants.isEmpty()) "" else "\n${item.variants.size} variantes con precio y stock propios"
    return "${p.category} · ${priceLabel(p.priceClp)}\n" +
        "$modeLabel · ${privateAvailabilityLabel(p.visible)}$soldOutInfo\n" +
        stockLine + variantsLine
}

/**
 * Combina el catálogo descargado con las ediciones y eliminaciones hechas sin conexión (A17 / RNF-DAT-03).
 */
fun mergeOfflineCatalog(
    cachedProducts: List<OwnerProduct>,
    pendingEdits: List<OwnerProduct>,
    deletedIds: Set<String>
): List<OwnerProduct> {
    val merged = cachedProducts
        .filter { it.base.id !in deletedIds }
        .associateBy { it.base.id }
        .toMutableMap()
    for (edited in pendingEdits) {
        merged[edited.base.id] = edited
    }
    return merged.values.sortedBy { it.base.name.lowercase() }
}

/** Mensaje de estado de sincronización con o sin red en el catálogo de la emprendedora (A17). */
fun formatCatalogSyncStatus(offline: Boolean, productCount: Int, pendingChanges: Int): String =
    if (offline) {
        "Sin conexión. Catálogo guardado; $pendingChanges cambios pendientes. Se enviarán al volver la red."
    } else {
        "Catálogo actualizado. $productCount productos. $pendingChanges cambios pendientes."
    }

// -----------------------------------------------------------------------------
// Mejoras P1 de Diseño Inclusivo y Gerontecnología (W3C COGA / WCAG 2.2):
// Conversión de precios a palabras, billetes rápidos y ajuste de stock en 1 toque
// -----------------------------------------------------------------------------

private val UNITS_WORDS = listOf(
    "", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
    "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"
)

private val TENS_WORDS = listOf(
    "", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"
)

private val HUNDREDS_WORDS = listOf(
    "", "ciento", "doscientos", "trescientos", "cuatrocientos",
    "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"
)

private fun underOneThousandToWords(n: Int): String {
    if (n == 0) return ""
    if (n == 100) return "cien"
    val h = n / 100
    val rem = n % 100
    val hundredPart = HUNDREDS_WORDS[h]
    val tenUnitPart = when {
        rem == 0 -> ""
        rem < 30 -> UNITS_WORDS[rem]
        else -> {
            val t = rem / 10
            val u = rem % 10
            if (u == 0) TENS_WORDS[t] else "${TENS_WORDS[t]} y ${UNITS_WORDS[u]}"
        }
    }
    return listOf(hundredPart, tenUnitPart).filter { it.isNotEmpty() }.joinToString(" ")
}

/** Convierte un número entero en pesos chilenos a su lectura en palabras (ej. 3500 -> "tres mil quinientos"). */
fun numberToSpanishWords(amount: Long): String {
    if (amount < 0) return "menos ${numberToSpanishWords(-amount)}"
    if (amount == 0L) return "cero"
    if (amount >= 1_000_000_000L) return amount.toString()

    val millions = (amount / 1_000_000L).toInt()
    val thousands = ((amount % 1_000_000L) / 1_000L).toInt()
    val remainder = (amount % 1_000L).toInt()

    val parts = mutableListOf<String>()
    if (millions > 0) {
        parts.add(if (millions == 1) "un millón" else "${underOneThousandToWords(millions)} millones")
    }
    if (thousands > 0) {
        parts.add(if (thousands == 1) "mil" else "${underOneThousandToWords(thousands)} mil")
    }
    if (remainder > 0) {
        parts.add(underOneThousandToWords(remainder))
    }
    return parts.joinToString(" ")
}

/**
 * Devuelve la confirmación en palabras del precio escrito para evitar errores de ceros ($350 vs $3.500).
 */
fun formatPriceInWords(priceRaw: String): String {
    val clean = priceRaw.trim()
    if (clean.isEmpty()) {
        return "Escribe el precio o usa los botones de billetes (+ $500, + $1.000, + $5.000)."
    }
    val value = clean.toLongOrNull()
        ?: return "Usa solo números sin puntos ni signos (por ejemplo: 3500)."
    if (value <= 0L) {
        return "El precio debe ser mayor que cero."
    }
    val words = numberToSpanishWords(value).replaceFirstChar { it.uppercase() }
    val currency = if (value == 1L) "peso chileno" else "pesos chilenos"
    return "Escrito: $words $currency (${priceLabel(value)})"
}

/** Suma un monto rápido de billete chileno (+500, +1000, +5000) al precio actual. */
fun addQuickPriceAmount(currentText: String, deltaClp: Long): String {
    val current = currentText.trim().toLongOrNull()?.coerceAtLeast(0L) ?: 0L
    val next = (current + deltaClp).coerceAtLeast(0L)
    return if (next == 0L) "" else next.toString()
}

/** Ajusta en 1 toque las unidades de stock sin permitir valores negativos. */
fun adjustQuickQuantity(currentQuantity: Int?, delta: Int): Int =
    ((currentQuantity ?: 0) + delta).coerceAtLeast(0)
