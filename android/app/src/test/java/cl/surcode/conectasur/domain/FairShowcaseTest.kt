package cl.surcode.conectasur.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FairShowcaseTest {

    @Test
    fun a07IncludesOnlyConfirmedAndAdminAddedWithPublicProductSample() {
        val participants = listOf(
            FairParticipant("f1", "s-confirmed", "Tejidos Ana", FairParticipantStatus.CONFIRMED),
            FairParticipant("f1", "s-added", "Mieles Bea", FairParticipantStatus.ADDED_BY_ADMIN),
            FairParticipant("f1", "s-invited", "Pendiente Clara", FairParticipantStatus.INVITED),
            FairParticipant("f1", "s-rejected", "Rechazada Sofía", FairParticipantStatus.REJECTED)
        )
        val publicCatalog = listOf(
            PublicProduct("p1", "s-confirmed", "Chalina", "", "Ropa", 12000L, false, "f.jpg"),
            PublicProduct("p2", "s-confirmed", "Gorro", "", "Ropa", 8000L, false, "f.jpg"),
            PublicProduct("p3", "s-confirmed", "Guantes", "", "Ropa", 6000L, false, "f.jpg"),
            PublicProduct("p4", "s-confirmed", "Calcetines", "", "Ropa", 4000L, false, "f.jpg"),
            PublicProduct("p5", "s-rejected", "Miel oculta", "", "Alimentos", 5000L, false, "f.jpg"),
            PublicProduct("p6", "s-added", "Miel Ulmo", "", "Alimentos", 7000L, false, "f.jpg")
        )

        val showcase = buildPublicFairShowcase(participants, publicCatalog, maxProductsPerShop = 3)

        assertEquals(listOf("s-added", "s-confirmed"), showcase.map { it.shopId })
        assertFalse(showcase.any { it.shopId == "s-invited" || it.shopId == "s-rejected" })
        assertEquals(3, showcase.first { it.shopId == "s-confirmed" }.sampleProducts.size)
        assertEquals(listOf("p6"), showcase.first { it.shopId == "s-added" }.sampleProducts.map { it.id })
        assertTrue(FairParticipantStatus.CONFIRMED.isPubliclyConfirmed)
        assertTrue(FairParticipantStatus.ADDED_BY_ADMIN.isPubliclyConfirmed)
        assertFalse(FairParticipantStatus.REJECTED.isPubliclyConfirmed)
        assertFalse(FairParticipantStatus.INVITED.isPubliclyConfirmed)
        assertEquals(FairParticipantStatus.ADDED_BY_ADMIN, FairParticipantStatus.from("added"))
        assertEquals(FairParticipantStatus.REJECTED, FairParticipantStatus.from("declined"))
    }
}
