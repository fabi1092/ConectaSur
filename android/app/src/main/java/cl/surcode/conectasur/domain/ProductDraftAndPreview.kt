package cl.surcode.conectasur.domain

/**
 * Pasos del flujo guiado para crear o editar un producto (A01 / RF-PRO-01).
 * Responsable: Benjamín Tampier.
 */
val PRODUCT_EDITOR_STEPS: List<String> = listOf(
    "Foto",
    "Datos del producto",
    "Variantes",
    "Disponibilidad y publicación"
)

/** Normaliza el paso del borrador dentro del rango válido de los 4 pasos guiados (A01, A11). */
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
fun formatDraftReviewSummary(name: String, priceText: String, variantCount: Int): String =
    "$name\nPrecio: $priceText pesos chilenos\n$variantCount variantes.\nSolo se publicará cuando confirmes Guardar producto."

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
