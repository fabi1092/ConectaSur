package cl.surcode.conectasur

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.ui.LogoEncoder
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class StoreAccessTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    @Test fun logoIsResizedConvertedToJpegAndFlattenedOnWhite() = runBlocking {
        val file = File(context.cacheDir, "logo-encoder-test.png")
        val bitmap = Bitmap.createBitmap(2400, 1200, Bitmap.Config.ARGB_8888)
        try {
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            val encoded = LogoEncoder.jpeg(context.contentResolver, Uri.fromFile(file))
            assertTrue(encoded.size <= 2097152)
            assertEquals(0xff.toByte(), encoded[0])
            assertEquals(0xd8.toByte(), encoded[1])
            val decoded = BitmapFactory.decodeByteArray(encoded, 0, encoded.size)
            try {
                assertTrue(maxOf(decoded.width, decoded.height) <= 1024)
                assertEquals(android.graphics.Color.WHITE, decoded.getPixel(0, 0))
            } finally { decoded.recycle() }
        } finally { bitmap.recycle(); file.delete() }
    }

    @Test fun invalidLogoFileDoesNotBecomeAnUpload() = runBlocking {
        val file = File(context.cacheDir, "invalid-logo-test.txt")
        try {
            file.writeText("Esto no es una imagen")
            try { LogoEncoder.jpeg(context.contentResolver, Uri.fromFile(file)); fail("Debe rechazar el archivo") }
            catch (_: IllegalArgumentException) { }
        } finally { file.delete() }
    }

    /** Cuenta FICTICIA y configuración explícitas. Restaura la tienda al terminar. */
    @Test fun liveLoginEditCloseReopenAndLogout() = runBlocking {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("supabaseLive") == "true" && RepositoryProvider.supabaseReady())
        val email = requireNotNull(args.getString("testEmail"))
        val password = requireNotNull(args.getString("testPassword"))
        val api = SupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY, SecureBackendStore(context, "store_acceptance_test"))
        val session = api.signIn(email, password)
        val shops = SupabaseShopRepository(api)
        val original = requireNotNull(shops.getShop(requireNotNull(session.shopId)))
        val description = "Prueba de acceso y tienda Android"
        // Comenzar sin otra sesión ni preferencia biométrica de una ejecución anterior.
        context.getSharedPreferences("supabase_private", Context.MODE_PRIVATE).edit().clear().commit()
        BiometricStoreLock(context).clear()
        var scenario: ActivityScenario<StoreActivity>? = null
        try {
            scenario = ActivityScenario.launch(StoreActivity::class.java)
            waitUntil(scenario) { it.findViewById<View>(R.id.account_login).isShown && !it.findViewById<View>(R.id.account_progress).isShown }
            onView(withId(R.id.account_email)).perform(scrollTo(), replaceText(email))
            onView(withId(R.id.account_password)).perform(scrollTo(), replaceText(password), closeSoftKeyboard())
            onView(withId(R.id.account_login)).perform(scrollTo(), click())
            waitUntil(scenario) { it.findViewById<View>(R.id.shop_form).isShown && !it.findViewById<View>(R.id.account_progress).isShown }
            onView(withId(R.id.shop_edit_description)).perform(scrollTo(), replaceText(description), closeSoftKeyboard())
            onView(withId(R.id.shop_save)).perform(scrollTo(), click())
            waitUntil(scenario) { it.findViewById<android.widget.TextView>(R.id.account_status).text.startsWith("Cambios guardados") }
            scenario.close()
            scenario = ActivityScenario.launch(StoreActivity::class.java)
            waitUntil(scenario) { it.findViewById<View>(R.id.shop_form).isShown && !it.findViewById<View>(R.id.account_progress).isShown }
            onView(withId(R.id.shop_edit_description)).check(matches(withText(description)))
            onView(withId(R.id.account_logout)).perform(scrollTo(), click())
            onView(withId(R.id.login_form)).check(matches(isDisplayed()))
            onView(withId(R.id.shop_form)).check(matches(withEffectiveVisibility(Visibility.GONE)))
        } finally {
            scenario?.close()
            shops.updateShop(original)
            RepositoryProvider.auth().signOut()
            api.signOut()
        }
    }

    private fun waitUntil(scenario: ActivityScenario<StoreActivity>, condition: (StoreActivity) -> Boolean) {
        val deadline = android.os.SystemClock.elapsedRealtime() + 45000
        while (android.os.SystemClock.elapsedRealtime() < deadline) {
            var ready = false
            scenario.onActivity { ready = condition(it) }
            if (ready) return
            android.os.SystemClock.sleep(100)
        }
        fail("La pantalla no llegó al estado esperado")
    }
}
