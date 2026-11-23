package cl.surcode.conectasur.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationConsentStoreTest {

    private class FakeConsentStorage : ConsentStorage {
        private val map = mutableMapOf<String, Any>()
        override fun getBoolean(key: String, defaultValue: Boolean) = (map[key] as? Boolean) ?: defaultValue
        override fun putBoolean(key: String, value: Boolean) { map[key] = value }
        override fun getLong(key: String, defaultValue: Long) = (map[key] as? Long) ?: defaultValue
        override fun putLong(key: String, value: Long) { map[key] = value }
        override fun getString(key: String): String? = map[key] as? String
        override fun putString(key: String, value: String?) {
            if (value == null) map.remove(key) else map[key] = value
        }
    }

    @Test
    fun noConsentByDefaultAndBlocksTokenStorage() {
        val store = NotificationConsentStore(FakeConsentStorage())
        assertFalse(store.isConsented())
        assertFalse(store.saveTokenIfConsented("fcm_abc"))
        assertNull(store.lastToken())
    }

    @Test
    fun grantConsentSavesTokenAndOptOutClearsIt() {
        val store = NotificationConsentStore(FakeConsentStorage())
        store.grantConsent(nowMs = 1000L)
        assertTrue(store.isConsented())
        assertEquals(1000L, store.consentTimestampMs())

        assertTrue(store.saveTokenIfConsented("fcm_token_123"))
        assertEquals("fcm_token_123", store.lastToken())

        val cleared = store.revokeConsent(nowMs = 2000L)
        assertEquals("fcm_token_123", cleared)
        assertFalse(store.isConsented())
        assertNull(store.lastToken())
        assertEquals(2000L, store.optOutTimestampMs())
    }

    @Test
    fun extractGcmSenderIdParsesValidFirebaseAppId() {
        assertEquals("605457944341", NotificationConsentStore.extractGcmSenderId("1:605457944341:android:165c402c6637419ae0a31c"))
        assertNull(NotificationConsentStore.extractGcmSenderId(""))
        assertNull(NotificationConsentStore.extractGcmSenderId("1:notanumber:android:123"))
    }

    @Test
    fun followedFairNotificationAlwaysIdentifiesFairName() {
        val (title, body) = NotificationConsentStore.buildFairNotificationText(
            rawTitle = "Nueva participación confirmada",
            rawBody = "Tejidos Alerce confirmó asistencia.",
            fairName = "Feria Costumbrista de Alerce",
            type = "followed_fair"
        )
        assertTrue(title.contains("Feria Costumbrista de Alerce") || body.contains("Feria Costumbrista de Alerce"))

        val (invTitle, invBody) = NotificationConsentStore.buildFairNotificationText(
            rawTitle = null,
            rawBody = null,
            fairName = "Feria Plaza de Armas",
            type = "fair_invitation"
        )
        assertEquals("Invitación a feria", invTitle)
        assertTrue(invBody.contains("Feria Plaza de Armas"))

        val (backendInvTitle, backendInvBody) = NotificationConsentStore.buildFairNotificationText(
            rawTitle = null,
            rawBody = null,
            fairName = "Feria de Alerce",
            type = "invitation"
        )
        assertEquals("Invitación a feria", backendInvTitle)
        assertTrue(backendInvBody.contains("Feria de Alerce"))

        val (followTitle, followBody) = NotificationConsentStore.buildFairNotificationText(
            rawTitle = null,
            rawBody = null,
            fairName = "Feria Angelmó",
            type = "follow_fair_confirmed"
        )
        assertTrue(followTitle.contains("Feria Angelmó"))
        assertTrue(followBody.contains("Feria Angelmó"))
    }

    @Test
    fun a15NotificationScheduleFiltersDeliveryByConfiguredHoursAndConsent() {
        val store = NotificationConsentStore(FakeConsentStorage())
        assertEquals(9, store.allowedStartHour())
        assertEquals(20, store.allowedEndHour())
        assertFalse(store.shouldDeliverNotificationAt(12))

        store.grantConsent(nowMs = 5000L)
        assertTrue(store.shouldDeliverNotificationAt(9))
        assertTrue(store.shouldDeliverNotificationAt(19))
        assertFalse(store.shouldDeliverNotificationAt(20))
        assertFalse(store.shouldDeliverNotificationAt(7))

        store.setNotificationSchedule(startHour = 10, endHour = 18, enabled = true)
        assertEquals("10:00 a 18:00 hrs", store.formatScheduleLabel())
        assertFalse(store.shouldDeliverNotificationAt(9))
        assertTrue(store.shouldDeliverNotificationAt(10))
        assertTrue(store.shouldDeliverNotificationAt(17))
        assertFalse(store.shouldDeliverNotificationAt(18))

        store.revokeConsent()
        assertFalse(store.shouldDeliverNotificationAt(12))
    }
}
