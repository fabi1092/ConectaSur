package cl.surcode.conectasur.data

import cl.surcode.conectasur.domain.FollowTargetType
import cl.surcode.conectasur.domain.PendingFollowAction
import cl.surcode.conectasur.domain.RatingTargetType
import cl.surcode.conectasur.domain.Shop
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BuyerEngagementStoreTest {

    private class MemoryStorage : ConsentStorage {
        private val data = mutableMapOf<String, Any>()
        override fun getBoolean(key: String, defaultValue: Boolean) = (data[key] as? Boolean) ?: defaultValue
        override fun putBoolean(key: String, value: Boolean) { data[key] = value }
        override fun getLong(key: String, defaultValue: Long) = (data[key] as? Long) ?: defaultValue
        override fun putLong(key: String, value: Long) { data[key] = value }
        override fun getString(key: String): String? = data[key] as? String
        override fun putString(key: String, value: String?) {
            if (value == null) data.remove(key) else data[key] = value
        }
    }

    @Test
    fun a09AndA10BuyerFollowsShopAndAssociationIdempotently() {
        val store = BuyerEngagementStore(MemoryStorage())
        val buyerId = "buyer-uid-1"

        assertFalse(store.isFollowing(buyerId, FollowTargetType.SHOP, "shop-1"))
        assertFalse(store.isFollowing(buyerId, FollowTargetType.ASSOCIATION, "assoc-1"))

        store.followLocal(buyerId, FollowTargetType.SHOP, "shop-1", "Tejidos del Sur", nowMs = 100L)
        store.followLocal(buyerId, FollowTargetType.ASSOCIATION, "assoc-1", "Feria Costumbrista", nowMs = 200L)
        store.followLocal(buyerId, FollowTargetType.SHOP, "shop-1", "Tejidos del Sur", nowMs = 300L)

        assertTrue(store.isFollowing(buyerId, FollowTargetType.SHOP, "shop-1"))
        assertTrue(store.isFollowing(buyerId, FollowTargetType.ASSOCIATION, "assoc-1"))
        assertEquals(2, store.currentFollows(buyerId).size)
        assertFalse(store.isFollowing("other-buyer", FollowTargetType.SHOP, "shop-1"))
    }

    @Test
    fun a11BuyerUnfollowsShopAndAssociation() {
        val store = BuyerEngagementStore(MemoryStorage())
        val buyerId = "buyer-uid-2"

        store.followLocal(buyerId, FollowTargetType.SHOP, "shop-1", "Tienda Uno")
        store.followLocal(buyerId, FollowTargetType.ASSOCIATION, "assoc-1", "Asoc Uno")

        assertTrue(store.unfollowLocal(buyerId, FollowTargetType.SHOP, "shop-1"))
        assertFalse(store.isFollowing(buyerId, FollowTargetType.SHOP, "shop-1"))
        assertTrue(store.isFollowing(buyerId, FollowTargetType.ASSOCIATION, "assoc-1"))

        assertTrue(store.unfollowLocal(buyerId, FollowTargetType.ASSOCIATION, "assoc-1"))
        assertTrue(store.currentFollows(buyerId).isEmpty())
        assertFalse(store.unfollowLocal(buyerId, FollowTargetType.ASSOCIATION, "assoc-1"))
    }

    @Test
    fun a12PendingFollowCompletesAutomaticallyOnSignInAndExpiresAfterTtl() {
        val store = BuyerEngagementStore(MemoryStorage())

        store.savePendingFollow(
            PendingFollowAction(
                targetType = FollowTargetType.SHOP,
                targetId = "shop-42",
                targetName = "Cerámica Austral",
                destinationScreen = "public_store",
                destinationId = "shop-42"
            ),
            nowMs = 1_000L
        )

        assertNull(store.completePendingFollowIfSignedIn(null, nowMs = 2_000L))
        assertNotNull(store.peekPendingFollow(nowMs = 2_000L))

        val completed = store.completePendingFollowIfSignedIn("google-uid-9", nowMs = 3_000L)
        assertNotNull(completed)
        assertEquals("shop-42", completed?.targetId)
        assertTrue(store.isFollowing("google-uid-9", FollowTargetType.SHOP, "shop-42"))
        assertNull(store.peekPendingFollow(nowMs = 4_000L))

        store.savePendingFollow(
            PendingFollowAction(
                targetType = FollowTargetType.ASSOCIATION,
                targetId = "assoc-9",
                targetName = "Manos de Alerce",
                destinationScreen = "association_detail",
                destinationId = "assoc-9"
            ),
            nowMs = 10_000L
        )
        assertNull(store.completePendingFollowIfSignedIn("google-uid-9", nowMs = 10_000L + 16 * 60 * 1000L))
        assertFalse(store.isFollowing("google-uid-9", FollowTargetType.ASSOCIATION, "assoc-9"))
    }

    @Test
    fun a17RatingsWorkWhenEnabledAndAreBlockedWhenDisabled() {
        val store = BuyerEngagementStore(MemoryStorage())

        store.submitRatingLocal(
            type = RatingTargetType.SHOP,
            targetId = "shop-1",
            score = 5,
            comment = "Excelente atención",
            buyerId = "buyer-a",
            authorLabel = "ana@correo.cl",
            ratingsAllowed = true,
            nowMs = 100L
        )
        store.submitRatingLocal(
            type = RatingTargetType.SHOP,
            targetId = "shop-1",
            score = 4,
            comment = "Muy buenos productos",
            buyerId = "buyer-b",
            authorLabel = "luis@correo.cl",
            ratingsAllowed = true,
            nowMs = 200L
        )

        val summary = store.summaryLocal(RatingTargetType.SHOP, "shop-1", "buyer-a")
        assertEquals(2, summary.count)
        assertEquals(4.5, summary.average, 0.01)
        assertEquals(5, summary.userRating?.score)
        assertTrue(BuyerEngagementStore.formatSummaryText(summary).contains("4,5 de 5"))

        store.submitRatingLocal(
            type = RatingTargetType.PRODUCT,
            targetId = "prod-7",
            score = 3,
            comment = "Bonito detalle",
            buyerId = "buyer-a",
            ratingsAllowed = true,
            nowMs = 300L
        )
        assertEquals(1, store.summaryLocal(RatingTargetType.PRODUCT, "prod-7", "buyer-a").count)

        val disabledRejected = runCatching {
            store.submitRatingLocal(
                type = RatingTargetType.PRODUCT,
                targetId = "prod-7",
                score = 5,
                comment = "No debería guardarse",
                buyerId = "buyer-b",
                ratingsAllowed = false
            )
        }.isFailure
        assertTrue(disabledRejected)
        assertEquals(1, store.summaryLocal(RatingTargetType.PRODUCT, "prod-7", "buyer-a").count)

        val shopDisabled = Shop("s1", "Tienda", "", null, "", "", "", showPrices = true, allowRatings = false)
        assertFalse(shopDisabled.allowRatings)
    }

    @Test
    fun publicReviewerNameFormattingNeverLeaksEmailsAndFormatsDates() {
        assertEquals(
            "María G.",
            BuyerEngagementStore.formatPublicReviewerName("María González Pérez")
        )
        assertEquals(
            "Camila",
            BuyerEngagementStore.formatPublicReviewerName("Camila")
        )
        assertEquals(
            "Luis S.",
            BuyerEngagementStore.formatPublicReviewerName("ana@correo.cl", "Luis Soto")
        )
        assertEquals(
            "María G.",
            BuyerEngagementStore.formatPublicReviewerName("María G.")
        )
        assertEquals(
            "Comprador verificado",
            BuyerEngagementStore.formatPublicReviewerName(null, "  ", "Comprador", "user@mail.cl", "https://spam.example")
        )

        val parsed = BuyerEngagementStore.parseIsoTimestampMillis("2026-11-23T15:27:08.400191+00:00")
        assertTrue(parsed > 0L)
        assertTrue(BuyerEngagementStore.parseIsoTimestampMillis("2026-11-23 15:27:08+00") > 0L)
        val formattedDate = BuyerEngagementStore.formatRatingDate(parsed, nowMillis = parsed)
        assertTrue("Fecha inesperada: $formattedDate", formattedDate.startsWith("23 nov"))

        val store = BuyerEngagementStore(MemoryStorage())
        val saved = store.submitRatingLocal(
            type = RatingTargetType.SHOP,
            targetId = "shop-privacy",
            score = 5,
            comment = "Excelente",
            buyerId = "buyer-1",
            authorLabel = "privado@correo.cl",
            ratingsAllowed = true,
            nowMs = parsed
        )
        assertEquals("Comprador verificado", saved.authorLabel)
        val summary = store.summaryLocal(RatingTargetType.SHOP, "shop-privacy", "buyer-1")
        assertFalse(BuyerEngagementStore.formatEntryLabel(summary.recent.first()).contains("@"))
    }
}
