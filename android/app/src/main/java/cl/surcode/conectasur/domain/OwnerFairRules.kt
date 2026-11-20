package cl.surcode.conectasur.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.Locale
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Elemento del calendario de ferias para una emprendedora (A02-A04). */
data class OwnerFairCalendarItem(
    val fair: PublicFair,
    val shopId: String,
    val status: FairParticipantStatus
) {
    val statusLabel: String
        get() = when (status) {
            FairParticipantStatus.INVITED -> "Invitada · Pendiente de respuesta"
            FairParticipantStatus.CONFIRMED -> "Confirmada · Participo"
            FairParticipantStatus.ADDED_BY_ADMIN -> "Confirmada por administración"
            FairParticipantStatus.REJECTED -> "No participo"
        }
}

enum class FairSuggestionReason {
    CONFIRMED_SAME_DAY,
    IN_PROGRESS_NEARBY_GPS
}

/** Sugerencia automática de feria al registrar una venta (A05-A06). */
data class FairSaleSuggestion(
    val fair: PublicFair,
    val reason: FairSuggestionReason,
    val distanceKm: Double? = null,
    val label: String
)

fun defaultPlatformFairs(referenceDate: LocalDate = LocalDate.now()): List<PublicFair> = listOf(
    PublicFair(
        id = "feria-costanera-pm",
        name = "Feria Costanera Puerto Montt",
        description = "Feria abierta de emprendedoras y artesanía en la costanera.",
        imageUrl = null,
        placeName = "Costanera de Puerto Montt",
        latitude = -41.4717,
        longitude = -72.9369,
        startsAt = "${referenceDate}T08:00:00",
        endsAt = "${referenceDate}T21:00:00",
        organizer = "Municipalidad de Puerto Montt / ConectaSur"
    ),
    PublicFair(
        id = "feria-artesanal-alerce",
        name = "Feria Artesanal de Alerce",
        description = "Encuentro comunitario de emprendimientos de Alerce.",
        imageUrl = null,
        placeName = "Plaza de Alerce",
        latitude = -41.3948,
        longitude = -72.9052,
        startsAt = "${referenceDate.plusDays(1)}T10:00:00",
        endsAt = "${referenceDate.plusDays(1)}T19:00:00",
        organizer = "Agrupación Alerce"
    ),
    PublicFair(
        id = "feria-presidente-ibanez",
        name = "Feria Municipal Presidente Ibáñez",
        description = "Puestos de comida casera, textiles y artesanía local.",
        imageUrl = null,
        placeName = "Sector Presidente Ibáñez, Puerto Montt",
        latitude = -41.4636,
        longitude = -72.9489,
        startsAt = "${referenceDate.plusDays(3)}T09:30:00",
        endsAt = "${referenceDate.plusDays(3)}T18:30:00",
        organizer = "Municipalidad de Puerto Montt"
    ),
    PublicFair(
        id = "feria-parque-la-paloma",
        name = "Feria Parque La Paloma",
        description = "Feria familiar al aire libre junto al parque.",
        imageUrl = null,
        placeName = "Parque La Paloma, Puerto Montt",
        latitude = -41.4547,
        longitude = -72.9311,
        startsAt = "${referenceDate.plusDays(6)}T10:00:00",
        endsAt = "${referenceDate.plusDays(6)}T20:00:00",
        organizer = "Red ConectaSur"
    )
)

/** Ordena las ferias disponibles e incluye el estado actual de la tienda (A02-A04). */
fun buildOwnerFairCalendar(
    fairs: List<PublicFair>,
    participationsByFairId: Map<String, FairParticipantStatus>,
    shopId: String
): List<OwnerFairCalendarItem> = fairs
    .filter { it.status.isBlank() || it.status.equals("published", ignoreCase = true) }
    .sortedWith(compareBy<PublicFair>({ it.startsAt }, { it.name.lowercase() }))
    .map { fair ->
        OwnerFairCalendarItem(
            fair = fair,
            shopId = shopId,
            status = participationsByFairId[fair.id] ?: FairParticipantStatus.INVITED
        )
    }

/** Convierte la decisión en 1 toque ("Participo" / "No participo") al estado oficial (A03-A04). */
fun applyOneTapFairDecision(participate: Boolean): FairParticipantStatus =
    if (participate) FairParticipantStatus.CONFIRMED else FairParticipantStatus.REJECTED

/** Distancia aproximada en kilómetros usando la fórmula de Haversine. */
fun haversineDistanceKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val earthRadiusKm = 6371.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLng = Math.toRadians(lng2 - lng1)
    val a = sin(dLat / 2) * sin(dLat / 2) +
        cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
        sin(dLng / 2) * sin(dLng / 2)
    return earthRadiusKm * 2.0 * atan2(sqrt(a), sqrt(1.0 - a))
}

internal fun parseFairLocalDate(raw: String, zoneId: ZoneId): LocalDate? {
    val clean = raw.trim()
    if (clean.isEmpty()) return null
    runCatching { return OffsetDateTime.parse(clean).atZoneSameInstant(zoneId).toLocalDate() }
    runCatching { return Instant.parse(clean).atZone(zoneId).toLocalDate() }
    runCatching { return LocalDateTime.parse(clean).toLocalDate() }
    runCatching { return LocalDate.parse(clean.take(10)) }
    return null
}

internal fun parseFairInstant(raw: String, zoneId: ZoneId, endOfDayFallback: Boolean): Instant? {
    val clean = raw.trim()
    if (clean.isEmpty()) return null
    runCatching { return Instant.parse(clean) }
    runCatching { return OffsetDateTime.parse(clean).toInstant() }
    runCatching { return LocalDateTime.parse(clean).atZone(zoneId).toInstant() }
    runCatching {
        val d = LocalDate.parse(clean.take(10))
        return if (endOfDayFallback) d.atTime(23, 59, 59, 999_999_999).atZone(zoneId).toInstant()
        else d.atStartOfDay(zoneId).toInstant()
    }
    return null
}

fun parseFairDateRange(
    startsAt: String,
    endsAt: String,
    zoneId: ZoneId = ZoneId.systemDefault()
): Pair<LocalDate, LocalDate>? {
    val start = parseFairLocalDate(startsAt, zoneId) ?: return null
    val parsedEnd = parseFairLocalDate(endsAt, zoneId)
    val end = if (parsedEnd != null && !parsedEnd.isBefore(start)) parsedEnd else start
    return start to end
}

fun isFairOnDate(
    fair: PublicFair,
    date: LocalDate,
    zoneId: ZoneId = ZoneId.systemDefault()
): Boolean {
    val (start, end) = parseFairDateRange(fair.startsAt, fair.endsAt, zoneId) ?: return false
    return !date.isBefore(start) && !date.isAfter(end)
}

fun isFairInProgress(
    fair: PublicFair,
    now: Instant,
    zoneId: ZoneId = ZoneId.systemDefault()
): Boolean {
    val start = parseFairInstant(fair.startsAt, zoneId, endOfDayFallback = false) ?: return false
    val parsedEnd = parseFairInstant(fair.endsAt, zoneId, endOfDayFallback = true)
    val end = if (parsedEnd != null && !parsedEnd.isBefore(start)) parsedEnd else {
        start.atZone(zoneId).toLocalDate().atTime(23, 59, 59, 999_999_999).atZone(zoneId).toInstant()
    }
    return !now.isBefore(start) && !now.isAfter(end)
}

/**
 * Sugiere la feria para anotar una venta:
 * - A05: Si hay una feria confirmada para el mismo día de la venta.
 * - A06: Si no hay confirmada para hoy, sugiere una feria en curso cercana según GPS.
 */
fun suggestFairForSale(
    calendar: List<OwnerFairCalendarItem>,
    now: Instant = Instant.now(),
    userLat: Double? = null,
    userLng: Double? = null,
    maxGpsDistanceKm: Double = 3.0,
    zoneId: ZoneId = ZoneId.systemDefault()
): FairSaleSuggestion? {
    val today = now.atZone(zoneId).toLocalDate()
    val confirmedToday = calendar.filter { item ->
        item.status.isPubliclyConfirmed && isFairOnDate(item.fair, today, zoneId)
    }
    if (confirmedToday.isNotEmpty()) {
        val chosen = if (userLat != null && userLng != null) {
            confirmedToday.minByOrNull { item ->
                item.fair.distanceKm ?: haversineDistanceKm(userLat, userLng, item.fair.latitude, item.fair.longitude)
            }!!
        } else {
            confirmedToday.first()
        }
        val dist = if (userLat != null && userLng != null) {
            chosen.fair.distanceKm ?: haversineDistanceKm(userLat, userLng, chosen.fair.latitude, chosen.fair.longitude)
        } else {
            chosen.fair.distanceKm
        }
        return FairSaleSuggestion(
            fair = chosen.fair,
            reason = FairSuggestionReason.CONFIRMED_SAME_DAY,
            distanceKm = dist,
            label = "Feria sugerida (confirmada para hoy): ${chosen.fair.name}"
        )
    }

    if (userLat == null || userLng == null) return null

    val nearbyInProgress = calendar
        .filter { item ->
            item.status != FairParticipantStatus.REJECTED && isFairInProgress(item.fair, now, zoneId)
        }
        .map { item ->
            val dist = item.fair.distanceKm ?: haversineDistanceKm(userLat, userLng, item.fair.latitude, item.fair.longitude)
            item.fair.copy(distanceKm = dist) to dist
        }
        .filter { (_, dist) -> dist <= maxGpsDistanceKm }
        .minByOrNull { (_, dist) -> dist }
        ?: return null

    val (fair, dist) = nearbyInProgress
    return FairSaleSuggestion(
        fair = fair,
        reason = FairSuggestionReason.IN_PROGRESS_NEARBY_GPS,
        distanceKm = dist,
        label = String.format(Locale.US, "Feria sugerida por GPS (en curso a %.1f km): %s", dist, fair.name)
    )
}
