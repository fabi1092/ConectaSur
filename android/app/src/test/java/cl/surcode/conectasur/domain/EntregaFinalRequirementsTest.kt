package cl.surcode.conectasur.domain

import cl.surcode.conectasur.data.BiometricStoreLock
import cl.surcode.conectasur.data.BuyerEngagementStore
import cl.surcode.conectasur.data.ConsentStorage
import cl.surcode.conectasur.data.NotificationConsentStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/**
 * Verificación unitaria integral para los criterios Android de cierre
 * A02-A06 y A08-A10 (Fabián Barroso), actualizada a Entrega 7 y Entrega 8.
 */
class EntregaFinalRequirementsTest {

    private class MemoryConsentStorage : ConsentStorage {
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
    fun a02AccessProfilesPkceAndBiometricLockCycle() {
        val owner = Session("uid-owner", "ana@demo.conectasur.cl", Role.EMPRENDEDORA, "shop_demo_ana")
        val buyer = Session("uid-buyer", "comprador@demo.conectasur.cl", Role.COMPRADOR, null)
        val admin = Session("uid-admin", "admin@demo.conectasur.cl", Role.ADMIN, null)

        assertEquals(Role.EMPRENDEDORA, owner.role)
        assertNotNull(owner.shopId)
        assertEquals(Role.COMPRADOR, buyer.role)
        assertNull(buyer.shopId)
        assertEquals(Role.ADMIN, admin.role)

        val pkce = GooglePkceRequest.create(now = 1_000L)
        assertTrue(pkce.authorizationUrl("https://supabase-surcode.codepulse.cl").contains("code_challenge_method=s256"))
        assertEquals(
            "abc123",
            pkce.callbackCode("conectasur://auth/callback?client_state=${pkce.state}&code=abc123", now = 2_000L)
        )

        BiometricStoreLock.lockSession()
        assertFalse(BiometricStoreLock.isSessionUnlocked())
        BiometricStoreLock.markSessionUnlocked()
        assertTrue(BiometricStoreLock.isSessionUnlocked())
        BiometricStoreLock.lockSession()
        assertFalse(BiometricStoreLock.isSessionUnlocked())
    }

    @Test
    fun a03ShopChannelsWhatsappRatingsSwitchScheduleAndFairCalendar() {
        assertEquals(ContactMode.BOTH, ContactMode.from("both"))
        assertTrue(ContactMode.BOTH.hasWhatsApp && ContactMode.BOTH.hasForm)
        assertFalse(ContactMode.FORM.hasWhatsApp)
        assertFalse(ContactMode.WHATSAPP.hasForm)

        assertEquals("56984561234", whatsappNumber("9 8456 1234"))
        assertEquals("56984561234", whatsappNumber("+56 9 8456 1234"))
        assertNull(whatsappNumber("javascript:alert(1)"))

        assertTrue(PUERTO_MONTT_SECTORS.containsAll(listOf("Alerce", "Puerto Montt Centro", "Mirasol")))

        val shop = Shop(
            id = "s1",
            name = "Taller Costanera",
            description = "Tejidos y telar",
            logoUrl = null,
            entrepreneurType = "Tejidos",
            sector = "Puerto Montt Centro",
            contact = "taller@demo.cl",
            showPrices = false,
            contactMode = ContactMode.BOTH,
            whatsappNumber = "56984561234",
            pickupLabel = "Costanera puesto 4",
            pickupLat = -41.4717,
            pickupLng = -72.9369,
            allowRatings = true,
            contactNotifications = true,
            notifyFrom = "09:00",
            notifyUntil = "20:00"
        )
        assertTrue(shop.allowRatings)
        assertTrue(shop.contactNotifications)
        assertEquals("09:00", shop.notifyFrom)
        assertEquals("20:00", shop.notifyUntil)

        val product = OwnerProduct(
            CatalogProduct("p1", "s1", "Chaleco", "Lana natural", "Ropa", 18000L, true, StockMode.UNITS, 2, true, "foto.jpg"),
            listOf(Variant("v1", "Talla M", 2, priceClp = 20000L))
        )
        val hiddenByShop = product.toPublicOrNull(shopShowPrices = shop.showPrices)!!
        assertNull(hiddenByShop.priceClp)
        assertNull(hiddenByShop.variants.single().priceClp)

        val fair = PublicFair(
            id = "f1",
            name = "Feria Costanera Puerto Montt",
            description = "",
            imageUrl = null,
            placeName = "Costanera",
            latitude = -41.4717,
            longitude = -72.9369,
            startsAt = "2026-11-24T09:00:00",
            endsAt = "2026-11-24T20:00:00",
            organizer = "ConectaSur"
        )
        val calendar = buildOwnerFairCalendar(listOf(fair), emptyMap(), shop.id)
        assertEquals(FairParticipantStatus.INVITED, calendar.single().status)
        assertEquals(FairParticipantStatus.CONFIRMED, applyOneTapFairDecision(participate = true))
        assertEquals(FairParticipantStatus.REJECTED, applyOneTapFairDecision(participate = false))
    }

    @Test
    fun a04ProductGuidedStepsVariantsModesStockAndDefaults() {
        assertEquals(5, PRODUCT_EDITOR_STEPS.size)
        assertEquals("Paso 1 de 5: Foto principal", formatEditorStepHeader(0))
        assertEquals("Paso 5 de 5: Resumen y publicación", formatEditorStepHeader(4))

        val defaults = ProductDefaults.fromValues("ON_REQUEST", "ORDER", visible = false, showPrice = false)
        val fresh = defaults.newCatalogProduct("p-nuevo", "s1")
        assertEquals(StockMode.ON_REQUEST, fresh.stockMode)
        assertEquals("ORDER", fresh.soldOut)
        assertFalse(fresh.visible)
        assertFalse(fresh.showPrice)
        assertNull(fresh.quantity)

        val validated = OwnerProduct(
            CatalogProduct("p2", "s1", "Manta chilota", "Telar", "Ropa", 38000L, true, StockMode.UNITS, 0, true, "main.jpg", soldOut = "SHOW"),
            listOf(
                Variant("crudo", "Crudo", 3, priceClp = 38000L, photo = "crudo.jpg"),
                Variant("canelo", "Canelo", 0, priceClp = null, photo = null)
            )
        ).validatedForCatalog()
        assertEquals(3, validated.base.quantity)

        val pub = validated.toPublicOrNull()!!
        assertEquals("crudo.jpg", pub.variantPhoto("crudo"))
        assertEquals("main.jpg", pub.variantPhoto("canelo"))
        assertEquals(38000L, pub.variants[1].priceClp)
        assertFalse(pub.variants[1].available)
    }

    @Test
    fun a05SalesValidationVariantDiscountUniqueRemovalOrderAndFairSuggestion() {
        val gorro = OwnerProduct(
            CatalogProduct("gorro", "s1", "Gorro de lana", "Lana", "Ropa", 9500L, true, StockMode.UNITS, 5, true, "gorro.jpg"),
            listOf(Variant("S", "Talla S", 1), Variant("M", "Talla M", 4))
        )
        assertNotNull(gorro.saleError(null, 1))
        assertNotNull(gorro.saleError("S", 2))
        assertNull(gorro.saleError("M", 2))

        val afterSale = gorro.sell("M", 2)
        assertEquals(3, afterSale.base.quantity)
        assertEquals(1, afterSale.variants[0].quantity)
        assertEquals(2, afterSale.variants[1].quantity)

        val unique = OwnerProduct(
            CatalogProduct("reloj", "s1", "Reloj de alerce", "Pieza única", "Artesanías", 52000L, true, StockMode.UNIQUE, 1, true, "reloj.jpg")
        )
        val soldUnique = unique.sell(null, 1)
        assertEquals(0, soldUnique.base.quantity)
        assertNull(soldUnique.toPublicOrNull())

        val exhaustedOrder = OwnerProduct(
            CatalogProduct("pan", "s1", "Pan amasado", "A pedido al agotarse", "Alimentos", 2500L, true, StockMode.UNITS, 0, true, "pan.jpg", soldOut = "ORDER")
        )
        assertNull(exhaustedOrder.saleError(null, 4))
        val afterOrder = exhaustedOrder.sell(null, 4)
        assertEquals(0, afterOrder.base.quantity)
        assertTrue(afterOrder.toPublicOrNull()!!.onRequest)

        val zone = ZoneId.of("America/Santiago")
        val now = Instant.parse("2026-11-24T15:00:00Z")
        val confirmedTodayFair = PublicFair(
            id = "f-confirmada",
            name = "Feria Artesanal Alerce",
            description = "",
            imageUrl = null,
            placeName = "Alerce",
            latitude = -41.3948,
            longitude = -72.9052,
            startsAt = "2026-11-24T09:00:00",
            endsAt = "2026-11-24T20:00:00",
            organizer = "ConectaSur"
        )
        val sameDaySuggestion = suggestFairForSale(
            calendar = buildOwnerFairCalendar(listOf(confirmedTodayFair), mapOf("f-confirmada" to FairParticipantStatus.CONFIRMED), "s1"),
            now = now,
            zoneId = zone
        )
        assertNotNull(sameDaySuggestion)
        assertEquals(FairSuggestionReason.CONFIRMED_SAME_DAY, sameDaySuggestion!!.reason)

        val inProgressGpsFair = confirmedTodayFair.copy(
            id = "f-gps",
            name = "Feria Costanera Puerto Montt",
            latitude = -41.4717,
            longitude = -72.9369
        )
        val gpsSuggestion = suggestFairForSale(
            calendar = buildOwnerFairCalendar(listOf(inProgressGpsFair), emptyMap(), "s1"),
            now = now,
            userLat = -41.4718,
            userLng = -72.9370,
            maxGpsDistanceKm = 3.0,
            zoneId = zone
        )
        assertNotNull(gpsSuggestion)
        assertEquals(FairSuggestionReason.IN_PROGRESS_NEARBY_GPS, gpsSuggestion!!.reason)
    }

    @Test
    fun a06BuyerSearchFairShowcaseFollowResumeRatingsAndNotificationConsent() {
        val visibleProduct = OwnerProduct(
            CatalogProduct("p1", "s1", "Mermelada de Murta", "Frutos silvestres de Alerce", "Alimentos", 4500L, true, StockMode.UNITS, 8, true, "murta.jpg")
        ).toPublicOrNull()!!
        val hiddenProduct = OwnerProduct(
            CatalogProduct("p2", "s1", "Borrador privado", "No publicado", "Alimentos", 4000L, true, StockMode.UNITS, 5, false, "otra.jpg")
        ).toPublicOrNull()
        assertNull(hiddenProduct)

        val catalog = listOf(visibleProduct)
        assertEquals(1, searchProducts(catalog, "murta alerce").size)
        assertTrue(searchProducts(catalog, "tejido").isEmpty())

        val showcase = buildPublicFairShowcase(
            participants = listOf(
                FairParticipant("f1", "s1", "Taller Murta", FairParticipantStatus.CONFIRMED),
                FairParticipant("f1", "s2", "Invitada", FairParticipantStatus.INVITED),
                FairParticipant("f1", "s3", "Rechazada", FairParticipantStatus.REJECTED)
            ),
            publicProducts = catalog
        )
        assertEquals(listOf("s1"), showcase.map { it.shopId })
        assertEquals(listOf("p1"), showcase.single().sampleProducts.map { it.id })

        val engagement = BuyerEngagementStore(MemoryConsentStorage())
        engagement.savePendingFollow(
            PendingFollowAction(FollowTargetType.SHOP, "s1", "Taller Murta", "public_store", "s1"),
            nowMs = 10_000L
        )
        assertNotNull(engagement.completePendingFollowIfSignedIn("buyer-uid", nowMs = 12_000L))
        assertTrue(engagement.isFollowing("buyer-uid", FollowTargetType.SHOP, "s1"))

        assertThrows(IllegalStateException::class.java) {
            engagement.submitRatingLocal(
                type = RatingTargetType.SHOP,
                targetId = "s1",
                score = 5,
                comment = "Excelente",
                buyerId = "buyer-uid",
                authorLabel = "María Soto",
                ratingsAllowed = false
            )
        }
        val rating = engagement.submitRatingLocal(
            type = RatingTargetType.SHOP,
            targetId = "s1",
            score = 5,
            comment = "Muy buena atención",
            buyerId = "buyer-uid",
            authorLabel = "María Soto",
            ratingsAllowed = true
        )
        assertEquals("María S.", rating.authorLabel)
        assertEquals("Comprador verificado", BuyerEngagementStore.formatPublicReviewerName("correo@ejemplo.cl"))

        assertTrue(AppNotification("n1", "invitation", "Invitación a feria").isUnread)

        val consent = NotificationConsentStore(MemoryConsentStorage())
        assertFalse(consent.isConsented())
        assertFalse(consent.saveTokenIfConsented("fcm_blocked"))
        consent.grantConsent(nowMs = 10_000L)
        consent.setNotificationSchedule(startHour = 8, endHour = 20, enabled = true)
        assertTrue(consent.shouldDeliverNotificationAt(10))
        assertFalse(consent.shouldDeliverNotificationAt(22))
        assertTrue(consent.saveTokenIfConsented("fcm_valid"))
        assertEquals("fcm_valid", consent.lastToken())
        consent.revokeConsent(nowMs = 20_000L)
        assertFalse(consent.isConsented())
        assertNull(consent.lastToken())
    }

    @Test
    fun a08LargeTextInclusivePriceConfirmationAndQuickControls() {
        val words = formatPriceInWords("3500")
        assertTrue(words.contains("Tres mil quinientos pesos chilenos"))
        assertTrue(words.contains("$3.500 CLP"))
        assertEquals("1500", addQuickPriceAmount("1000", 500L))
        assertEquals("6500", addQuickPriceAmount("1500", 5000L))
        assertEquals(0, adjustQuickQuantity(0, -1))
        assertEquals(5, adjustQuickQuantity(4, 1))
    }

    @Test
    fun a09OfflineDraftRecoveryCatalogMergeAndPendingStatus() {
        assertTrue(shouldResumeDraft(existingDraftId = "draft-1", requestedProductId = null))
        assertTrue(shouldResumeDraft(existingDraftId = "draft-1", requestedProductId = "draft-1"))
        assertFalse(shouldResumeDraft(existingDraftId = "draft-1", requestedProductId = "other"))

        val cached = listOf(
            OwnerProduct(CatalogProduct("1", "s1", "Canasto", "", "Artesanías", 5000L, true, StockMode.UNITS, 2, true, "f.jpg")),
            OwnerProduct(CatalogProduct("2", "s1", "Eliminado offline", "", "Ropa", 7000L, true, StockMode.UNITS, 1, true, "f.jpg"))
        )
        val pendingEdits = listOf(
            OwnerProduct(CatalogProduct("1", "s1", "Canasto mimbre", "", "Artesanías", 5500L, true, StockMode.UNITS, 2, true, "f.jpg")),
            OwnerProduct(CatalogProduct("3", "s1", "Aros lana", "", "Artesanías", 3000L, true, StockMode.UNITS, 4, true, "f.jpg"))
        )
        val merged = mergeOfflineCatalog(cached, pendingEdits, deletedIds = setOf("2"))
        assertEquals(listOf("Aros lana", "Canasto mimbre"), merged.map { it.base.name })
        val syncText = formatCatalogSyncStatus(offline = true, productCount = 2, pendingChanges = 3)
        assertTrue(syncText.contains("Sin conexión") && syncText.contains("3 cambios pendientes"))
    }

    @Test
    fun a10ChileanSpanishCurrencyWordsSpeechAndSummaries() {
        assertEquals("$12.500 CLP", priceLabel(12500L))
        assertEquals("Consultar precio", priceLabel(null))
        assertEquals("1 peso chileno", spokenPrice(1L))
        assertEquals("12500 pesos chilenos", spokenPrice(12500L))
        assertEquals("Total: 12500 pesos chilenos y envío 1 peso chileno", chileanSpeech("Total: $12.500 CLP y envío $1 CLP"))
        assertEquals("un millón cuatrocientos cincuenta", numberToSpanishWords(1_000_450L))
        assertEquals("Promedio: 4,5 de 5 (2 calificaciones)", BuyerEngagementStore.formatSummaryText(RatingSummary(4.5, 2)))
    }
}
