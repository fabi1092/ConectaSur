package cl.surcode.conectasur.domain

import org.junit.Assert.*
import org.junit.Test

class Entrega5RulesTest {
    private fun item(
        mode: StockMode = StockMode.UNITS,
        out: String = "HIDE",
        qty: Int? = 0,
        showPrice: Boolean = true,
        photo: String = "foto_principal.jpg"
    ) = CatalogProduct("x", "s", "Producto", "", "Artesanías", 8000, showPrice, mode, qty, true, photo, soldOut = out)

    @Test fun exhaustedHasThreeExplicitBehaviors() {
        assertNull(item().toPublicOrNull())
        assertTrue(item(out = "SHOW").toPublicOrNull()!!.soldOut)
        assertTrue(item(out = "ORDER").toPublicOrNull()!!.onRequest)
    }

    @Test fun uniqueNeverReturnsWhenSold() {
        for (out in listOf("HIDE", "SHOW", "ORDER")) assertNull(item(StockMode.UNIQUE, out).toPublicOrNull())
    }

    @Test fun uncountedRegularRemainsAvailable() {
        assertNotNull(item(StockMode.UNLIMITED, qty = null).toPublicOrNull())
        assertFalse(item(StockMode.UNLIMITED, qty = null).toPublicOrNull()!!.onRequest)
    }

    @Test fun priceReadingSaysChileanPesos() {
        assertEquals("Precio: 8000 pesos chilenos", chileanSpeech("Precio: $8.000 CLP"))
        assertEquals("1 peso chileno", chileanSpeech("$1 CLP"))
    }

    @Test fun variantsUseOwnOrMainPriceAndPhotoAndExposeAvailability() {
        val variants = listOf(
            Variant("v1", "Rojo", quantity = 2, priceClp = 9500L, photo = "foto_rojo.jpg"),
            Variant("v2", "Azul", quantity = 0, priceClp = null, photo = null)
        )
        val public = OwnerProduct(item(qty = 2), variants).toPublicOrNull()!!
        assertEquals(2, public.variants.size)
        assertEquals(9500L, public.variants[0].priceClp)
        assertTrue(public.variants[0].available)
        assertEquals("foto_rojo.jpg", public.variantPhoto("v1"))
        assertEquals(8000L, public.variants[1].priceClp)
        assertFalse(public.variants[1].available)
        assertEquals("foto_principal.jpg", public.variantPhoto("v2"))
    }

    @Test fun hiddenPriceRemovesProductAndVariantPricesInPublicProjection() {
        val variants = listOf(Variant("v1", "Rojo", quantity = 3, priceClp = 9500L))
        val hiddenByProduct = OwnerProduct(item(qty = 3, showPrice = false), variants).toPublicOrNull(shopShowPrices = true)!!
        assertNull(hiddenByProduct.priceClp)
        assertNull(hiddenByProduct.variants.single().priceClp)
        val hiddenByShop = OwnerProduct(item(qty = 3, showPrice = true), variants).toPublicOrNull(shopShowPrices = false)!!
        assertNull(hiddenByShop.priceClp)
        assertNull(hiddenByShop.variants.single().priceClp)
    }

    @Test fun catalogValidationSumsVariantStockAndRejectsInvalidCombinations() {
        val valid = OwnerProduct(
            item(mode = StockMode.UNITS, qty = 0),
            listOf(Variant("s", "Chico", 2), Variant("m", "Mediano", 3, priceClp = 9000L))
        ).validatedForCatalog()
        assertEquals(5, valid.base.quantity)

        val unlimited = OwnerProduct(
            item(mode = StockMode.UNLIMITED, qty = 5),
            listOf(Variant("u", "Estándar", 4))
        ).validatedForCatalog()
        assertNull(unlimited.base.quantity)
        assertEquals(0, unlimited.variants.single().quantity)

        assertThrows(IllegalArgumentException::class.java) {
            OwnerProduct(item(mode = StockMode.UNIQUE, qty = 1), listOf(Variant("u", "Única", 1))).validatedForCatalog()
        }
        assertThrows(IllegalArgumentException::class.java) {
            OwnerProduct(item(mode = StockMode.UNIQUE, qty = 2)).validatedForCatalog()
        }
        assertThrows(IllegalArgumentException::class.java) {
            OwnerProduct(item(mode = StockMode.UNITS, qty = 2), listOf(Variant("dup", "A", 1), Variant("dup", "B", 1))).validatedForCatalog()
        }
    }

    @Test fun exhaustedOrderProductAllowsSellingWithoutNegativeStock() {
        val exhaustedOrder = OwnerProduct(item(mode = StockMode.UNITS, out = "ORDER", qty = 0))
        val afterOrder = exhaustedOrder.sell(null, 3)
        assertEquals(0, afterOrder.base.quantity)
        assertTrue(afterOrder.toPublicOrNull()!!.onRequest)
    }

    @Test fun productDefaultsApplyOnlyToNewProducts() {
        val existing = item(mode = StockMode.UNITS, out = "HIDE", qty = 4, showPrice = true)
        val defaults = ProductDefaults.fromValues(stockMode = "ON_REQUEST", soldOut = "ORDER", visible = false, showPrice = false)
        val created = defaults.newCatalogProduct("nuevo", "s")
        assertEquals(StockMode.ON_REQUEST, created.stockMode)
        assertNull(created.quantity)
        assertEquals("ORDER", created.soldOut)
        assertFalse(created.visible)
        assertFalse(created.showPrice)
        // El producto existente conserva su modalidad, stock y visibilidad intactos.
        assertEquals(StockMode.UNITS, existing.stockMode)
        assertEquals(4, existing.quantity)
        assertEquals("HIDE", existing.soldOut)
        assertTrue(existing.visible)
        assertTrue(existing.showPrice)
    }
}
