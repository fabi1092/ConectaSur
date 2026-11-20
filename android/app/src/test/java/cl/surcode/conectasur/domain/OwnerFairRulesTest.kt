package cl.surcode.conectasur.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class OwnerFairRulesTest {

    private val zone = ZoneId.of("America/Santiago")

    private fun sampleFair(
        id: String,
        name: String,
        startsAt: String,
        endsAt: String,
        lat: Double = -41.4717,
        lng: Double = -72.9369,
        status: String = "published"
    ) = PublicFair(
        id = id,
        name = name,
        description = "",
        imageUrl = null,
        placeName = "Puerto Montt",
        latitude = lat,
        longitude = lng,
        startsAt = startsAt,
        endsAt = endsAt,
        organizer = "ConectaSur",
        status = status
    )

    @Test
    fun a02a04CalendarListsInvitedAndConfirmedFairsAndRespondsInOneTap() {
        val fairs = listOf(
            sampleFair("f-later", "Feria Parque La Paloma", "2026-11-25T10:00:00", "2026-11-25T18:00:00"),
            sampleFair("f-first", "Feria Costanera", "2026-11-20T09:00:00", "2026-11-20T19:00:00"),
            sampleFair("f-cancelled", "Feria Cancelada", "2026-11-19T09:00:00", "2026-11-19T18:00:00", status = "cancelled")
        )
        val participations = mapOf(
            "f-first" to FairParticipantStatus.CONFIRMED
        )

        val calendar = buildOwnerFairCalendar(fairs, participations, shopId = "shop-1")

        assertEquals(listOf("f-first", "f-later"), calendar.map { it.fair.id })
        assertEquals(FairParticipantStatus.CONFIRMED, calendar[0].status)
        assertEquals("Confirmada · Participo", calendar[0].statusLabel)
        assertEquals(FairParticipantStatus.INVITED, calendar[1].status)
        assertEquals("Invitada · Pendiente de respuesta", calendar[1].statusLabel)

        assertEquals(FairParticipantStatus.CONFIRMED, applyOneTapFairDecision(participate = true))
        assertEquals(FairParticipantStatus.REJECTED, applyOneTapFairDecision(participate = false))
    }

    @Test
    fun a05SuggestsConfirmedFairWhenSellingOnSameDay() {
        val calendar = buildOwnerFairCalendar(
            fairs = listOf(
                sampleFair("f-today-invited", "Feria Sin Confirmar Hoy", "2026-11-20T09:00:00", "2026-11-20T20:00:00"),
                sampleFair("f-today-confirmed", "Feria Artesanal Alerce", "2026-11-20T09:00:00", "2026-11-20T20:00:00")
            ),
            participationsByFairId = mapOf("f-today-confirmed" to FairParticipantStatus.CONFIRMED),
            shopId = "shop-1"
        )

        val now = Instant.parse("2026-11-20T15:00:00Z")
        val suggestion = suggestFairForSale(calendar, now = now, userLat = null, userLng = null, zoneId = zone)

        assertNotNull(suggestion)
        assertEquals("f-today-confirmed", suggestion!!.fair.id)
        assertEquals(FairSuggestionReason.CONFIRMED_SAME_DAY, suggestion.reason)
        assertTrue(suggestion.label.contains("Feria Artesanal Alerce"))
    }

    @Test
    fun a06SuggestsInProgressFairByGpsWhenNearbyAndIgnoresFarOrRejected() {
        val calendar = buildOwnerFairCalendar(
            fairs = listOf(
                sampleFair(
                    id = "f-far",
                    name = "Feria Lejana",
                    startsAt = "2026-11-20T08:00:00",
                    endsAt = "2026-11-20T20:00:00",
                    lat = -41.3500,
                    lng = -72.8500
                ),
                sampleFair(
                    id = "f-rejected",
                    name = "Feria Rechazada",
                    startsAt = "2026-11-20T08:00:00",
                    endsAt = "2026-11-20T20:00:00",
                    lat = -41.4717,
                    lng = -72.9369
                ),
                sampleFair(
                    id = "f-nearby",
                    name = "Feria Costanera Puerto Montt",
                    startsAt = "2026-11-20T08:00:00",
                    endsAt = "2026-11-20T20:00:00",
                    lat = -41.4718,
                    lng = -72.9370
                )
            ),
            participationsByFairId = mapOf("f-rejected" to FairParticipantStatus.REJECTED),
            shopId = "shop-1"
        )

        val duringFair = Instant.parse("2026-11-20T15:00:00Z") // 12:00 en America/Santiago (UTC-3)
        val suggestion = suggestFairForSale(
            calendar = calendar,
            now = duringFair,
            userLat = -41.4717,
            userLng = -72.9369,
            maxGpsDistanceKm = 3.0,
            zoneId = zone
        )

        assertNotNull(suggestion)
        assertEquals("f-nearby", suggestion!!.fair.id)
        assertEquals(FairSuggestionReason.IN_PROGRESS_NEARBY_GPS, suggestion.reason)
        assertTrue((suggestion.distanceKm ?: 99.0) < 0.2)

        val afterFair = Instant.parse("2026-11-21T02:00:00Z") // 23:00 en Santiago, fuera de horario
        assertNull(
            suggestFairForSale(
                calendar = calendar,
                now = afterFair,
                userLat = -41.4717,
                userLng = -72.9369,
                maxGpsDistanceKm = 3.0,
                zoneId = zone
            )
        )
    }
}
