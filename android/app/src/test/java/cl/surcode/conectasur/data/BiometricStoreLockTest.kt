package cl.surcode.conectasur.data

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BiometricStoreLockTest {

    @Before
    fun setUp() {
        BiometricStoreLock.lockSession()
        BiometricStoreLock.clearBackgroundLockSuppression()
    }

    @After
    fun tearDown() {
        BiometricStoreLock.lockSession()
        BiometricStoreLock.clearBackgroundLockSuppression()
    }

    @Test
    fun markSessionUnlockedAndLockSessionToggleSessionState() {
        assertFalse(BiometricStoreLock.isSessionUnlocked())
        val initialEpoch = BiometricStoreLock.lockEpoch()

        BiometricStoreLock.markSessionUnlocked()
        assertTrue(BiometricStoreLock.isSessionUnlocked())
        assertEquals(initialEpoch, BiometricStoreLock.lockEpoch())

        BiometricStoreLock.lockSession()
        assertFalse(BiometricStoreLock.isSessionUnlocked())
        assertEquals(initialEpoch + 1L, BiometricStoreLock.lockEpoch())
    }

    @Test
    fun suppressAndClearBackgroundLockKeepSessionUnlocked() {
        BiometricStoreLock.markSessionUnlocked()

        BiometricStoreLock.suppressNextBackgroundLock()
        assertTrue(BiometricStoreLock.isSessionUnlocked())

        BiometricStoreLock.clearBackgroundLockSuppression()
        assertTrue(BiometricStoreLock.isSessionUnlocked())
    }
}
