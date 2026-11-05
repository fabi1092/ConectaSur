package cl.surcode.conectasur

import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.Espresso.pressBack
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import cl.surcode.conectasur.data.BiometricStoreLock
import cl.surcode.conectasur.data.RepositoryProvider
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNull
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GuestCatalogTest {
    @Test fun guestStartsShoppingWithoutLoginAndCanOpenAccountWithoutLosingSearch() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assumeTrue(RepositoryProvider.supabaseReady())
        RepositoryProvider.initialize(context)
        RepositoryProvider.auth().signOut()
        BiometricStoreLock(context).clear()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            onView(withId(R.id.catalog_mode)).check(matches(withText(R.string.buyer_public_mode)))
            onView(withId(R.id.search_input)).perform(replaceText("Flores"), closeSoftKeyboard())
            scenario.recreate()
            onView(withId(R.id.search_input)).check(matches(withText("Flores")))
            val deadline = android.os.SystemClock.elapsedRealtime() + 45000
            var ready = false
            while (!ready && android.os.SystemClock.elapsedRealtime() < deadline) {
                scenario.onActivity { ready = it.findViewById<View>(R.id.main_account).isEnabled }
                if (!ready) android.os.SystemClock.sleep(100)
            }
            onView(withId(R.id.main_account)).check(matches(withText(R.string.account_entry))).perform(click())
            onView(withId(R.id.login_form)).check(matches(withEffectiveVisibility(Visibility.VISIBLE)))
            onView(withId(R.id.shop_form)).check(matches(withEffectiveVisibility(Visibility.GONE)))
            val accountDeadline = android.os.SystemClock.elapsedRealtime() + 45000
            var accountReady = false
            while (!accountReady && android.os.SystemClock.elapsedRealtime() < accountDeadline) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync {
                    accountReady = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
                        .any { it is StoreActivity && it.findViewById<View>(R.id.account_progress).visibility == View.GONE }
                }
                if (!accountReady) android.os.SystemClock.sleep(100)
            }
            pressBack()
            onView(withId(R.id.search_input)).check(matches(withText("Flores")))
            assertNull(runBlocking { RepositoryProvider.auth().currentSession() })
        }
    }
}
