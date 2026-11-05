package cl.surcode.conectasur

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cl.surcode.conectasur.data.RepositoryProvider
import org.junit.After
import org.junit.Assume.assumeFalse
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Ejecutar con -PconectaDemo=true; no usa credenciales ni atribuye la demo a Google. */
@RunWith(AndroidJUnit4::class)
class BuyerAccessTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private var scenario: ActivityScenario<MainActivity>? = null
    @Before fun prepare() {
        assumeFalse("Estas pruebas requieren la versión de demostración", RepositoryProvider.supabaseReady())
        context.getSharedPreferences("buyer_demo", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @After fun finish() {
        scenario?.close()
        context.getSharedPreferences("buyer_demo", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @Test fun demoBuyerPersistsWhenReopenedAndLogoutReturnsToVisitor() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        onView(withId(R.id.nav_home)).perform(click())
        onView(withId(R.id.open_store)).check(matches(withEffectiveVisibility(Visibility.VISIBLE)))
        onView(withId(R.id.buyer_demo_login)).perform(scrollTo(), click())
        onView(withId(R.id.buyer_session_status)).check(matches(withText(R.string.buyer_demo_active)))
        onView(withId(R.id.buyer_logout)).check(matches(withEffectiveVisibility(Visibility.VISIBLE)))
        scenario!!.close()
        scenario = ActivityScenario.launch(MainActivity::class.java)
        onView(withId(R.id.nav_home)).perform(click())
        onView(withId(R.id.buyer_session_status)).check(matches(withText(R.string.buyer_demo_active)))
        onView(withId(R.id.buyer_logout)).perform(scrollTo(), click())
        onView(withId(R.id.buyer_logout)).check(matches(withEffectiveVisibility(Visibility.GONE)))
        onView(withId(R.id.open_store)).check(matches(withEffectiveVisibility(Visibility.VISIBLE)))
    }
    @Test fun foreignImplicitLinkNeverOpensABuyerSession() {
        val intent = Intent(context, MainActivity::class.java).setData(Uri.parse(
            "conectasur://auth/callback#access_token=foreign&refresh_token=foreign"))
        scenario = ActivityScenario.launch(intent)
        onView(withId(R.id.nav_home)).perform(click())
        onView(withId(R.id.buyer_logout)).check(matches(withEffectiveVisibility(Visibility.GONE)))
        onView(withId(R.id.open_store)).check(matches(withEffectiveVisibility(Visibility.VISIBLE)))
    }
}
