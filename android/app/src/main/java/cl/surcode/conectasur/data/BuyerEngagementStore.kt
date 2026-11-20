package cl.surcode.conectasur.data

import android.content.Context
import cl.surcode.conectasur.domain.FollowRepository
import cl.surcode.conectasur.domain.FollowTargetType
import cl.surcode.conectasur.domain.FollowedTarget
import cl.surcode.conectasur.domain.PendingFollowAction
import cl.surcode.conectasur.domain.RatingEntry
import cl.surcode.conectasur.domain.RatingRepository
import cl.surcode.conectasur.domain.RatingSummary
import cl.surcode.conectasur.domain.RatingTargetType
import java.nio.charset.StandardCharsets
import java.text.NumberFormat
import java.util.Base64
import java.util.Locale

/**
 * Persiste seguimientos (A09-A12), acciones pendientes tras el acceso con Google (RF-ACC-08)
 * y calificaciones de tiendas o productos respetando allowRatings (A17).
 */
class BuyerEngagementStore(private val storage: ConsentStorage) : FollowRepository, RatingRepository {
    constructor(context: Context) : this(
        SharedPreferencesConsentStorage(context.applicationContext, PREFS_NAME)
    )

    fun currentFollows(buyerId: String?): List<FollowedTarget> {
        val normalizedBuyer = buyerId?.trim().orEmpty()
        if (normalizedBuyer.isBlank()) return emptyList()
        return parseFollowRecords(storage.getString(followsKey(normalizedBuyer)))
    }

    fun isFollowing(buyerId: String?, type: FollowTargetType, targetId: String): Boolean {
        if (buyerId.isNullOrBlank() || targetId.isBlank()) return false
        return currentFollows(buyerId).any { it.targetType == type && it.targetId == targetId }
    }

    fun followLocal(
        buyerId: String,
        type: FollowTargetType,
        targetId: String,
        targetName: String,
        nowMs: Long = System.currentTimeMillis()
    ): FollowedTarget {
        val normalizedBuyer = buyerId.trim()
        require(normalizedBuyer.isNotBlank()) { "Inicia sesión para seguir." }
        require(targetId.isNotBlank()) { "No identificamos el destino a seguir." }
        val cleanName = targetName.trim().take(120)
        val existing = currentFollows(normalizedBuyer)
            .filterNot { it.targetType == type && it.targetId == targetId }
        val item = FollowedTarget(type, targetId.trim(), cleanName, nowMs)
        val updated = listOf(item) + existing
        storage.putString(followsKey(normalizedBuyer), encodeFollowRecords(updated))
        return item
    }

    fun unfollowLocal(buyerId: String, type: FollowTargetType, targetId: String): Boolean {
        val normalizedBuyer = buyerId.trim()
        if (normalizedBuyer.isBlank() || targetId.isBlank()) return false
        val current = currentFollows(normalizedBuyer)
        val remaining = current.filterNot { it.targetType == type && it.targetId == targetId }
        if (remaining.size == current.size) return false
        storage.putString(followsKey(normalizedBuyer), encodeFollowRecords(remaining))
        return true
    }

    fun savePendingFollow(action: PendingFollowAction, nowMs: Long = System.currentTimeMillis()) {
        require(action.targetId.isNotBlank()) { "Destino pendiente inválido." }
        val encoded = listOf(
            action.targetType.wire,
            encodeB64(action.targetId),
            encodeB64(action.targetName),
            encodeB64(action.destinationScreen),
            encodeB64(action.destinationId),
            nowMs.toString()
        ).joinToString("|")
        storage.putString(KEY_PENDING_FOLLOW, encoded)
    }

    fun peekPendingFollow(nowMs: Long = System.currentTimeMillis()): PendingFollowAction? {
        val raw = storage.getString(KEY_PENDING_FOLLOW) ?: return null
        val parts = raw.split('|')
        if (parts.size < 6) {
            clearPendingFollow()
            return null
        }
        val type = FollowTargetType.from(parts[0])
        val savedAt = parts[5].toLongOrNull() ?: 0L
        if (type == null || nowMs - savedAt > PENDING_TTL_MS) {
            clearPendingFollow()
            return null
        }
        val targetId = decodeB64(parts[1])
        if (targetId.isBlank()) {
            clearPendingFollow()
            return null
        }
        return PendingFollowAction(
            targetType = type,
            targetId = targetId,
            targetName = decodeB64(parts[2]),
            destinationScreen = decodeB64(parts[3]),
            destinationId = decodeB64(parts[4])
        )
    }

    fun consumePendingFollow(nowMs: Long = System.currentTimeMillis()): PendingFollowAction? {
        val pending = peekPendingFollow(nowMs)
        clearPendingFollow()
        return pending
    }

    fun clearPendingFollow() {
        storage.putString(KEY_PENDING_FOLLOW, null)
    }

    /**
     * Si el usuario volvió autenticado luego de pulsar Seguir sin sesión (A12),
     * ejecuta automáticamente el seguimiento pendiente una sola vez.
     */
    fun completePendingFollowIfSignedIn(
        buyerId: String?,
        nowMs: Long = System.currentTimeMillis()
    ): FollowedTarget? {
        val cleanBuyer = buyerId?.trim().orEmpty()
        if (cleanBuyer.isBlank()) return null
        val pending = consumePendingFollow(nowMs) ?: return null
        return followLocal(
            buyerId = cleanBuyer,
            type = pending.targetType,
            targetId = pending.targetId,
            targetName = pending.targetName,
            nowMs = nowMs
        )
    }

    fun submitRatingLocal(
        type: RatingTargetType,
        targetId: String,
        score: Int,
        comment: String = "",
        buyerId: String? = null,
        authorLabel: String = "",
        ratingsAllowed: Boolean = true,
        nowMs: Long = System.currentTimeMillis()
    ): RatingEntry {
        check(ratingsAllowed) { "Esta tienda desactivó las calificaciones." }
        val cleanTarget = targetId.trim()
        require(cleanTarget.isNotBlank()) { "Elemento no válido para calificar." }
        require(score in 1..5) { "Elige una puntuación de 1 a 5." }
        val reviewerKey = buyerId?.trim()?.takeIf { it.isNotBlank() } ?: ANONYMOUS_REVIEWER
        val entryId = "${type.wire}:$cleanTarget:$reviewerKey"
        val cleanComment = comment.trim().take(MAX_COMMENT_LENGTH)
        val cleanAuthor = authorLabel.trim().take(60).ifBlank {
            if (reviewerKey == ANONYMOUS_REVIEWER) "Visitante" else "Comprador"
        }
        val entry = RatingEntry(
            id = entryId,
            targetType = type,
            targetId = cleanTarget,
            score = score,
            comment = cleanComment,
            authorLabel = cleanAuthor,
            createdAtMillis = nowMs
        )
        val key = ratingsKey(type, cleanTarget)
        val updated = listOf(entry) + parseRatingRecords(storage.getString(key)).filterNot { it.id == entryId }
        storage.putString(key, encodeRatingRecords(updated))
        return entry
    }

    fun summaryLocal(type: RatingTargetType, targetId: String, buyerId: String?): RatingSummary {
        val cleanTarget = targetId.trim()
        if (cleanTarget.isBlank()) return RatingSummary(0.0, 0)
        val entries = parseRatingRecords(storage.getString(ratingsKey(type, cleanTarget)))
            .sortedByDescending { it.createdAtMillis }
        if (entries.isEmpty()) return RatingSummary(0.0, 0)
        val reviewerKey = buyerId?.trim()?.takeIf { it.isNotBlank() } ?: ANONYMOUS_REVIEWER
        val expectedId = "${type.wire}:$cleanTarget:$reviewerKey"
        val avg = entries.map { it.score }.average()
        return RatingSummary(
            average = avg,
            count = entries.size,
            userRating = entries.firstOrNull { it.id == expectedId },
            recent = entries.take(MAX_RECENT_RATINGS)
        )
    }

    override suspend fun listFollows(buyerId: String) = currentFollows(buyerId)

    override suspend fun follow(buyerId: String, type: FollowTargetType, id: String, name: String) =
        followLocal(buyerId, type, id, name)

    override suspend fun unfollow(buyerId: String, type: FollowTargetType, id: String) =
        unfollowLocal(buyerId, type, id)

    override suspend fun summary(type: RatingTargetType, targetId: String, buyerId: String?) =
        summaryLocal(type, targetId, buyerId)

    override suspend fun submit(
        type: RatingTargetType,
        targetId: String,
        score: Int,
        comment: String,
        buyerId: String?,
        authorLabel: String,
        ratingsAllowed: Boolean
    ) = submitRatingLocal(type, targetId, score, comment, buyerId, authorLabel, ratingsAllowed)

    private fun followsKey(buyerId: String) = "follows_${encodeB64(buyerId)}"
    private fun ratingsKey(type: RatingTargetType, targetId: String) =
        "ratings_${type.wire}_${encodeB64(targetId)}"

    private fun encodeFollowRecords(items: List<FollowedTarget>): String =
        items.joinToString("\n") {
            listOf(it.targetType.wire, encodeB64(it.targetId), encodeB64(it.targetName), it.followedAtMillis.toString())
                .joinToString("|")
        }

    private fun parseFollowRecords(raw: String?): List<FollowedTarget> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.lineSequence().mapNotNull { line ->
            val parts = line.split('|')
            if (parts.size < 4) return@mapNotNull null
            val type = FollowTargetType.from(parts[0]) ?: return@mapNotNull null
            val id = decodeB64(parts[1])
            if (id.isBlank()) return@mapNotNull null
            FollowedTarget(type, id, decodeB64(parts[2]), parts[3].toLongOrNull() ?: 0L)
        }.toList()
    }

    private fun encodeRatingRecords(items: List<RatingEntry>): String =
        items.joinToString("\n") {
            listOf(
                encodeB64(it.id),
                it.targetType.wire,
                encodeB64(it.targetId),
                it.score.toString(),
                encodeB64(it.comment),
                encodeB64(it.authorLabel),
                it.createdAtMillis.toString()
            ).joinToString("|")
        }

    private fun parseRatingRecords(raw: String?): List<RatingEntry> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.lineSequence().mapNotNull { line ->
            val parts = line.split('|')
            if (parts.size < 7) return@mapNotNull null
            val type = RatingTargetType.from(parts[1]) ?: return@mapNotNull null
            val targetId = decodeB64(parts[2])
            val score = parts[3].toIntOrNull()?.takeIf { it in 1..5 } ?: return@mapNotNull null
            RatingEntry(
                id = decodeB64(parts[0]),
                targetType = type,
                targetId = targetId,
                score = score,
                comment = decodeB64(parts[4]),
                authorLabel = decodeB64(parts[5]),
                createdAtMillis = parts[6].toLongOrNull() ?: 0L
            )
        }.toList()
    }

    private fun encodeB64(value: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(value.toByteArray(StandardCharsets.UTF_8))

    private fun decodeB64(value: String): String =
        runCatching { String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8) }.getOrDefault("")

    companion object {
        private const val PREFS_NAME = "conectasur_engagement_prefs"
        private const val KEY_PENDING_FOLLOW = "pending_follow_action"
        private const val ANONYMOUS_REVIEWER = "visitor_local"
        private const val PENDING_TTL_MS = 15 * 60 * 1000L
        private const val MAX_COMMENT_LENGTH = 240
        private const val MAX_RECENT_RATINGS = 5

        fun formatSummaryText(summary: RatingSummary): String {
            if (summary.count <= 0) return "Sin calificaciones aún."
            val formatter = NumberFormat.getNumberInstance(Locale.forLanguageTag("es-CL")).apply {
                minimumFractionDigits = 1
                maximumFractionDigits = 1
            }
            val unit = if (summary.count == 1) "calificación" else "calificaciones"
            return "Promedio: ${formatter.format(summary.average)} de 5 (${summary.count} $unit)"
        }

        fun formatEntryLabel(entry: RatingEntry): String {
            val base = "${entry.score} de 5 · ${entry.authorLabel.ifBlank { "Comprador" }}"
            return if (entry.comment.isBlank()) base else "$base\n${entry.comment}"
        }
    }
}
