package cl.surcode.conectasur

import android.app.Activity
import android.view.View
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import cl.surcode.conectasur.data.BiometricStoreLock
import cl.surcode.conectasur.data.RepositoryProvider
import cl.surcode.conectasur.domain.Role
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Solo cuentas ficticias recibidas por el ejecutor; nunca se incluyen claves en el código. */
@RunWith(AndroidJUnit4::class)
class UnifiedAccessTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    @Test fun oneFormRoutesAllRolesAndRestoresTheAccountAfterReopening() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("unifiedLive") == "true" && RepositoryProvider.supabaseReady())
        RepositoryProvider.initialize(context)
        BiometricStoreLock(context).clear()
        RepositoryProvider.auth().signOut()
        var scenario: ActivityScenario<MainActivity>? = null
        try {
            for ((key, role) in listOf("buyer" to Role.COMPRADOR, "ana" to Role.EMPRENDEDORA, "admin" to Role.ADMIN)) {
                val email = requireNotNull(args.getString(key + "Email"))
                val password = requireNotNull(args.getString(key + "Password"))
                scenario = ActivityScenario.launch(MainActivity::class.java)
                waitFor { it.findViewById<View>(R.id.open_store)?.isEnabled == true }
                onView(withId(R.id.open_store)).check(matches(withText(R.string.account_entry)))
                onView(withId(R.id.open_store)).perform(scrollTo(), click())
                waitForLogin()
                onView(withId(R.id.account_title)).check(matches(withText(R.string.login_title)))
                if (role == Role.COMPRADOR) {
                    login(email, "Incorrecta-prueba-2026")
                    waitFor { (it.findViewById<TextView>(R.id.account_status)?.text?.length ?: 0) > 0 && idle(it) }
                    assertNull(runBlocking { RepositoryProvider.auth().currentSession() })
                    onView(withId(R.id.login_form)).check(matches(withEffectiveVisibility(Visibility.VISIBLE)))
                    if (!runBlocking { RepositoryProvider.auth().isGoogleEnabled() }) {
                        onView(withId(R.id.account_google_login)).perform(scrollTo(), click())
                        waitFor { it.findViewById<TextView>(R.id.account_status)?.text?.contains("Google aún") == true && idle(it) }
                    }
                }
                login(email, password)
                waitFor { readyForRole(it, role) }
                assertEquals(role, runBlocking { RepositoryProvider.auth().currentSession() }?.role)
                if (role != Role.EMPRENDEDORA) {
                    onView(withId(R.id.shop_form)).check(matches(withEffectiveVisibility(Visibility.GONE)))
                    onView(withId(R.id.account_admin_web)).check(matches(withEffectiveVisibility(
                        if (role == Role.ADMIN) Visibility.VISIBLE else Visibility.GONE)))
                    onView(withId(R.id.account_catalog)).perform(scrollTo(), click())
                    waitFor { it is MainActivity && it.findViewById<View>(R.id.search_input) != null }
                    onView(withId(R.id.nav_home)).perform(click())
                } else onView(withId(R.id.account_back)).perform(scrollTo(), click())
                val entry = if (role == Role.EMPRENDEDORA) R.string.my_store else R.string.account_home
                waitFor { it.findViewById<TextView>(R.id.open_store)?.text == context.getString(entry) && it.findViewById<View>(R.id.open_store).isEnabled }
                scenario.close()
                scenario = ActivityScenario.launch(MainActivity::class.java)
                waitFor { it.findViewById<TextView>(R.id.open_store)?.text == context.getString(entry) && it.findViewById<View>(R.id.open_store).isEnabled }
                onView(withId(R.id.open_store)).perform(scrollTo(), click())
                waitFor { readyForRole(it, role) }
                onView(withId(R.id.account_logout)).perform(scrollTo(), click())
                waitForLogin()
                assertNull(runBlocking { RepositoryProvider.auth().currentSession() })
                onView(withId(R.id.account_back)).perform(scrollTo(), click())
                waitFor { it.findViewById<TextView>(R.id.open_store)?.text == context.getString(R.string.account_entry) && it.findViewById<View>(R.id.open_store).isEnabled }
                scenario.close()
                scenario = null
            }
        } finally {
            runCatching { scenario?.close() }
            RepositoryProvider.auth().signOut()
            BiometricStoreLock(context).clear()
        }
    }
    private fun login(email: String, password: String) {
        onView(withId(R.id.account_email)).perform(scrollTo(), replaceText(email))
        onView(withId(R.id.account_password)).perform(scrollTo(), replaceText(password), closeSoftKeyboard())
        onView(withId(R.id.account_login)).perform(scrollTo(), click())
    }
    private fun idle(activity: Activity) = activity.findViewById<View>(R.id.account_progress)?.visibility == View.GONE
    private fun waitForLogin() = waitFor { idle(it) && it.findViewById<View>(R.id.login_form)?.visibility == View.VISIBLE }
    private fun readyForRole(activity: Activity, role: Role): Boolean {
        if (activity !is StoreActivity || !idle(activity)) return false
        return if (role == Role.EMPRENDEDORA) activity.findViewById<View>(R.id.shop_form).visibility == View.VISIBLE
        else activity.findViewById<View>(R.id.account_profile).visibility == View.VISIBLE &&
            activity.findViewById<TextView>(R.id.account_title).text == context.getString(
                if (role == Role.ADMIN) R.string.account_admin_title else R.string.account_buyer_title)
    }
    private fun waitFor(condition: (Activity) -> Boolean) {
        val deadline = android.os.SystemClock.elapsedRealtime() + 45000
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            var ready = false
            instrumentation.runOnMainSync {
                ready = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).any(condition)
            }
            if (ready) return
            android.os.SystemClock.sleep(100)
        }
        fail("El acceso no llegó al estado esperado en 45 segundos")
    }
}
