package cl.surcode.conectasur.domain

import org.junit.Assert.*
import org.junit.Test

class SalesTest {
    private fun base(mode: StockMode = StockMode.UNITS, quantity: Int? = 6) = CatalogProduct(
        "gorro", "demo", "Gorro", "Gorro de lana", "Ropa", 9500, true, mode, quantity, true, "flores"
    )
    private val sizes = listOf(Variant("S", "Talla S", 1), Variant("M", "Talla M", 2), Variant("L", "Talla L", 3))

    @Test fun sellingOneVariantDoesNotChangeTheOthers() {
        val sold = OwnerProduct(base(), sizes).sell("M", 2)
        assertEquals(0, sold.variants.first { it.id == "M" }.quantity)
        assertEquals(1, sold.variants.first { it.id == "S" }.quantity)
        assertEquals(3, sold.variants.first { it.id == "L" }.quantity)
        assertEquals(4, sold.base.quantity)
        assertNotNull(sold.base.toPublicOrNull())
    }

    @Test fun uniquePieceDisappearsFromPublicCatalog() {
        val sold = OwnerProduct(base(StockMode.UNIQUE, 1)).sell(null, 1)
        assertEquals(0, sold.base.quantity)
        assertNull(sold.base.toPublicOrNull())
    }

    @Test fun plainProductDecreasesStock() {
        val sold = OwnerProduct(base(quantity = 3)).sell(null, 1)
        assertEquals(2, sold.base.quantity)
    }

    @Test fun madeToOrderNeverRunsOut() {
        val product = OwnerProduct(base(StockMode.ON_REQUEST, null))
        assertEquals(product, product.sell(null, 5))
    }

    @Test(expected = IllegalStateException::class) fun cannotSellMoreThanTheStock() {
        OwnerProduct(base(), sizes).sell("S", 2)
    }

    @Test(expected = IllegalArgumentException::class) fun variantProductNeedsAnOption() {
        OwnerProduct(base(), sizes).sell(null, 1)
    }

    @Test(expected = IllegalArgumentException::class) fun quantityMustBePositive() {
        OwnerProduct(base()).sell(null, 0)
    }
}

class SaleRulesTest {
    private val base = CatalogProduct("gorro", "demo", "Gorro", "Gorro de lana", "Ropa", 9500, true, StockMode.UNITS, 6, true, "flores")
    private val sizes = listOf(Variant("S", "Talla S", 1), Variant("M", "Talla M", 2))

    @org.junit.Test fun validSaleHasNoError() = org.junit.Assert.assertNull(OwnerProduct(base, sizes).saleError("M", 2))
    @org.junit.Test fun variantProductWithoutOptionIsRejected() = org.junit.Assert.assertNotNull(OwnerProduct(base, sizes).saleError(null, 1))
    @org.junit.Test fun moreThanVariantStockIsRejected() = org.junit.Assert.assertNotNull(OwnerProduct(base, sizes).saleError("S", 2))
    @org.junit.Test fun zeroQuantityIsRejected() = org.junit.Assert.assertNotNull(OwnerProduct(base).saleError(null, 0))
    @org.junit.Test fun madeToOrderIsNeverBlocked() =
        org.junit.Assert.assertNull(OwnerProduct(base.copy(stockMode = StockMode.ON_REQUEST, quantity = null)).saleError(null, 50))
}
