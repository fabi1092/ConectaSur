package cl.surcode.conectasur.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pruebas unitarias de los criterios A01, A10, A11, A16 y A17 (Benjamín Tampier). */
class ProductDraftAndPreviewTest {

    @Test
    fun guidedFlowNavigatesThroughAllFourStepsInOrder() {
        assertEquals("Paso 1 de 4: Foto", formatEditorStepHeader(0))
        assertEquals("Paso 2 de 4: Datos del producto", formatEditorStepHeader(nextEditorStep(0)))
        assertEquals("Paso 3 de 4: Variantes", formatEditorStepHeader(nextEditorStep(1)))
        assertEquals("Paso 4 de 4: Disponibilidad y publicación", formatEditorStepHeader(nextEditorStep(2)))
        assertEquals(3, nextEditorStep(3))
        assertEquals(0, previousEditorStep(0))
    }

    @Test
    fun interruptedDraftIsResumedWhenCreatingOrEditingSameProduct() {
        assertTrue(shouldResumeDraft(existingDraftId = "p-123", requestedProductId = null))
        assertTrue(shouldResumeDraft(existingDraftId = "p-123", requestedProductId = "p-123"))
        assertFalse(shouldResumeDraft(existingDraftId = "p-123", requestedProductId = "p-otro"))
        assertFalse(shouldResumeDraft(existingDraftId = null, requestedProductId = null))
    }

    @Test
    fun unavailableProductRemainsInOwnerCatalogButDisappearsFromPublicProjection() {
        val hidden = OwnerProduct(
            CatalogProduct(
                id = "p1",
                shopId = "s1",
                name = "Chaleco de lana",
                description = "Tejido artesanal",
                category = "Ropa",
                priceClp = 15000,
                showPrice = true,
                stockMode = StockMode.UNITS,
                quantity = 3,
                visible = false,
                photo = "https://conectasur.cl/foto.jpg"
            )
        )
        assertNull(hidden.toPublicOrNull())
        val privateText = formatPrivateCatalogDetails(hidden, "Por unidades", "Ocultar de la tienda")
        assertTrue(privateText.contains("No disponible"))
        assertTrue(privateText.contains("Stock: 3"))
    }

    @Test
    fun publicPreviewReflectsSoldOutAndOnRequestWithoutLeakingPrivateQuantities() {
        val soldOutProduct = OwnerProduct(
            CatalogProduct(
                id = "p2",
                shopId = "s1",
                name = "Mermelada casera",
                description = "Murtilla del sur",
                category = "Alimentos",
                priceClp = 4500,
                showPrice = true,
                stockMode = StockMode.UNITS,
                quantity = 0,
                visible = true,
                photo = "https://conectasur.cl/mermelada.jpg",
                soldOut = "SHOW"
            )
        )
        val preview = formatPublicPreviewDetails(
            soldOutProduct.base.description,
            soldOutProduct.toPublicOrNull(shopShowPrices = true)
        )
        assertTrue(preview.startsWith("Agotado · \$4.500 CLP"))
        assertFalse(preview.contains("Stock:"))
    }

    @Test
    fun offlineCatalogMergesPendingEditsAndExcludesDeletedProducts() {
        val cached = listOf(
            OwnerProduct(CatalogProduct("1", "s1", "Canasto", "", "Artesanías", 5000, true, StockMode.UNITS, 2, true, "f")),
            OwnerProduct(CatalogProduct("2", "s1", "Gorro", "", "Ropa", 7000, true, StockMode.UNITS, 4, true, "f"))
        )
        val edited = listOf(
            OwnerProduct(CatalogProduct("1", "s1", "Canasto grande", "", "Artesanías", 6500, true, StockMode.UNITS, 2, true, "f")),
            OwnerProduct(CatalogProduct("3", "s1", "Bufanda nueva", "", "Ropa", 8000, true, StockMode.UNITS, 1, true, "f"))
        )
        val merged = mergeOfflineCatalog(cached, edited, deletedIds = setOf("2"))
        assertEquals(listOf("Bufanda nueva", "Canasto grande"), merged.map { it.base.name })
        assertTrue(formatCatalogSyncStatus(offline = true, productCount = 2, pendingChanges = 3).contains("Sin conexión"))
    }

    @Test
    fun inclusivePriceInWordsAndQuickButtonsPreventZeroMistakes() {
        assertEquals("tres mil quinientos", numberToSpanishWords(3500))
        assertEquals("ocho mil", numberToSpanishWords(8000))
        assertEquals("doce mil quinientos", numberToSpanishWords(12500))
        assertTrue(formatPriceInWords("3500").contains("Tres mil quinientos pesos chilenos"))
        assertEquals("1500", addQuickPriceAmount("1000", 500))
        assertEquals("6500", addQuickPriceAmount("1500", 5000))
        assertEquals(0, adjustQuickQuantity(0, -1))
        assertEquals(4, adjustQuickQuantity(3, 1))
    }
}
