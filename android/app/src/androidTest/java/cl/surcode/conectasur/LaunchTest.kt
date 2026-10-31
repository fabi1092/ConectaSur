package cl.surcode.conectasur
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

class LaunchTest {
    @get:Rule val compose=createAndroidComposeRule<MainActivity>()
    @Test fun launchesAndShowsAccessibleBrand() {
        compose.onNodeWithContentDescription("ConectaSur por SurCode").assertIsDisplayed()
        compose.onNodeWithText("Tu emprendimiento,\nmás cerca").assertIsDisplayed()
        compose.onNodeWithText("Puerto Montt · Alerce").assertIsDisplayed()
    }
}
