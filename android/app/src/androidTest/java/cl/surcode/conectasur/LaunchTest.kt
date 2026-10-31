package cl.surcode.conectasur

import android.view.View
import android.widget.TextView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LaunchTest {
    @Test fun launchesXmlLayoutAndShowsAccessibleBrand() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val logo = activity.findViewById<View>(R.id.brand_logo)
                assertTrue(logo.isShown)
                assertEquals("ConectaSur por SurCode", logo.contentDescription)
                assertEquals("Tu tienda,\nmás cerca",
                    activity.findViewById<TextView>(R.id.welcome_title).text.toString())
                assertEquals("Puerto Montt · Alerce",
                    activity.findViewById<TextView>(R.id.community_name).text.toString())
            }
        }
    }
}
