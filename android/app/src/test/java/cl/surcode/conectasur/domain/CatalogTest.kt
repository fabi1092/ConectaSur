package cl.surcode.conectasur.domain

import org.junit.Assert.*
import org.junit.Test

class CatalogTest {
    private fun product(showPrice: Boolean = true, visible: Boolean = true,
        stockMode: StockMode = StockMode.UNITS, quantity: Int? = 2) = CatalogProduct(
        "uno", "demo", "Artesanía tejida", "Flores decorativas de lana", "Artesanías", 8000,
        showPrice, stockMode, quantity, visible, "flores")
    @Test fun hiddenPriceIsAbsentFromPublicProjection() {
        val public = product(showPrice=false).toPublicOrNull()!!
        assertNull(public.priceClp)
        assertEquals("Consultar precio", priceLabel(public.priceClp))
        assertEquals("Consultar precio", spokenPrice(public.priceClp))
    }
    @Test fun hiddenProductIsNotPublished() { assertNull(product(visible=false).toPublicOrNull()) }
    @Test fun soldUniqueProductIsNotPublished() { assertNull(product(stockMode=StockMode.UNIQUE, quantity=0).toPublicOrNull()) }
    @Test fun outOfStockProductIsNotPublished() { assertNull(product(quantity=0).toPublicOrNull()) }
    @Test fun madeToOrderDoesNotRequireStock() {
        val public = product(stockMode=StockMode.ON_REQUEST, quantity=null).toPublicOrNull()!!
        assertTrue(public.onRequest)
    }
    @Test fun searchesWithoutAccentsAndCombinesWords() {
        val public = listOf(product().toPublicOrNull()!!)
        assertEquals(1, searchProducts(public, "  ARTESANIA    lana  ").size)
        assertTrue(searchProducts(public, "flores madera").isEmpty())
    }
    @Test fun priceUsesChileanCurrencyAndSpeech() {
        assertEquals("$8.000 CLP", priceLabel(8000))
        assertEquals("8000 pesos chilenos", spokenPrice(8000))
        assertEquals("1 peso chileno", spokenPrice(1))
    }
    @Test fun whitespaceSearchKeepsProducts() {
        val public = listOf(product().toPublicOrNull()!!)
        assertEquals(public, searchProducts(public, "   "))
    }
}
