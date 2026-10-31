package cl.surcode.conectasur

import android.content.Context
import android.widget.RadioButton
import android.widget.Switch
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.Espresso.pressBack
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NavigationTest {
    private lateinit var scenario: ActivityScenario<MainActivity>
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Before fun startClean() {
        context.getSharedPreferences("presentation", Context.MODE_PRIVATE).edit().clear().commit()
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }
    @After fun close() {
        scenario.close()
        context.getSharedPreferences("presentation", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @Test fun searchesReadsChileanPriceAndReturnsToSearchAfterRecreation() {
        onView(withId(R.id.nav_catalog)).perform(click())
        onView(withId(R.id.search_input)).perform(replaceText("Flores"), closeSoftKeyboard())
        onView(withId(R.id.open_product)).perform(scrollTo(), click())
        onView(withId(R.id.product_price)).check(matches(withContentDescription("8000 pesos chilenos")))
        onView(withId(R.id.page_title)).check(matches(withText("Flores tejidas")))
        scenario.recreate()
        onView(withId(R.id.page_title)).check(matches(withText("Flores tejidas")))
        pressBack()
        onView(withId(R.id.search_input)).check(matches(withText("Flores")))
        onView(withId(R.id.results_count)).check(matches(withText("1 producto")))
    }
    @Test fun publicStoreDoesNotOfferOwnerControls() {
        onView(withId(R.id.nav_catalog)).perform(click())
        onView(withId(R.id.search_input)).perform(replaceText("Flores"), closeSoftKeyboard())
        onView(withId(R.id.open_product)).perform(scrollTo(), click())
        onView(withId(R.id.view_store)).perform(scrollTo(), click())
        onView(withId(R.id.page_title)).check(matches(withText(R.string.public_store_title)))
        onView(withId(R.id.change_logo)).check(matches(withEffectiveVisibility(Visibility.GONE)))
        onView(withId(R.id.store_sales)).check(matches(withEffectiveVisibility(Visibility.GONE)))
    }
    @Test fun emptySearchCanBeCleared() {
        onView(withId(R.id.nav_catalog)).perform(click())
        onView(withId(R.id.search_input)).perform(replaceText("zzzzzz"), closeSoftKeyboard())
        onView(withId(R.id.empty_message)).check(matches(isDisplayed()))
        onView(withId(R.id.clear_search)).perform(scrollTo(), click())
        onView(withId(R.id.results_count)).check(matches(withText("3 productos")))
    }
    @Test fun accessibilitySettingsAreAppliedAndPersistAfterRecreation() {
        onView(withId(R.id.open_settings)).perform(scrollTo(), click())
        var defaultSize = 0f
        scenario.onActivity { defaultSize = it.findViewById<TextView>(R.id.text_very_large).textSize }
        onView(withId(R.id.text_very_large)).perform(scrollTo(), click())
        onView(withId(R.id.big_buttons)).perform(scrollTo(), click())
        onView(withId(R.id.high_contrast)).perform(scrollTo(), click())
        scenario.onActivity {
            assertTrue(it.findViewById<RadioButton>(R.id.text_very_large).isChecked)
            assertTrue(it.findViewById<Switch>(R.id.big_buttons).isChecked)
            assertTrue(it.findViewById<Switch>(R.id.high_contrast).isChecked)
            assertTrue(it.findViewById<TextView>(R.id.text_very_large).textSize > defaultSize)
            val target = it.findViewById<Switch>(R.id.big_buttons)
            assertTrue(target.height >= (72 * it.resources.displayMetrics.density).toInt())
        }
        scenario.recreate()
        scenario.onActivity {
            assertTrue(it.findViewById<RadioButton>(R.id.text_very_large).isChecked)
            assertTrue(it.findViewById<Switch>(R.id.high_contrast).isChecked)
        }
        onView(withId(R.id.nav_home)).perform(click())
        onView(withId(R.id.welcome_title)).check(matches(isDisplayed()))
    }
    @Test fun homeHelpAndStoreAreReachableWithoutLoginOrAutomaticSpeech() {
        onView(withId(R.id.read_button)).check(matches(withText(R.string.listen)))
        onView(withId(R.id.open_store)).perform(scrollTo(), click())
        onView(withId(R.id.change_logo)).check(matches(isDisplayed()))
        onView(withId(R.id.nav_help)).perform(click())
        onView(withId(R.id.page_title)).check(matches(withText(R.string.help_title)))
        onView(withId(R.id.nav_home)).perform(click())
        onView(withId(R.id.welcome_title)).check(matches(isDisplayed()))
    }
}
