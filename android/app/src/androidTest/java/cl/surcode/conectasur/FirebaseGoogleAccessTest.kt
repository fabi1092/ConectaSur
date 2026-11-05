package cl.surcode.conectasur

import android.view.View
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import cl.surcode.conectasur.data.*
import cl.surcode.conectasur.domain.Role
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Google/Firebase real con credencial OAuth temporal explícita; no simula el proveedor ni el rol. */
@RunWith(AndroidJUnit4::class)
class FirebaseGoogleAccessTest {
    @Test fun realFirebaseBuyerAndProcessPersistence() = runBlocking {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val args=InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("firebaseLive")=="true" && FirebaseBuyerAuth.configured())
        val context=instrumentation.targetContext
        RepositoryProvider.initialize(context)
        val repo=RepositoryProvider.auth()
        val firebase=FirebaseAuth.getInstance(FirebaseApp.getInstance("conectasur-google-buyer"))
        val phase=requireNotNull(args.getString("firebasePhase"))
        var leaveSession=false
        if(phase=="sign-in"){
            repo.signOut();BiometricStoreLock(context).clear()
            firebase.signInWithCredential(GoogleAuthProvider.getCredential(null,requireNotNull(args.getString("googleAccessToken")))).await()
        }
        val user=requireNotNull(repo.currentSession())
        try {
            assertEquals(Role.COMPRADOR,user.role)
            assertTrue(user.uid.startsWith("firebase:"))
            assertNull(user.shopId)
            assertNull("Firebase no debe introducir tokens en el almacén de Supabase",SecureBackendStore(context).read("auth"))
            ActivityScenario.launch(StoreActivity::class.java).use { scenario ->
                val end=android.os.SystemClock.elapsedRealtime()+45000
                var ready=false
                while(!ready && android.os.SystemClock.elapsedRealtime()<end){scenario.onActivity {ready=it.findViewById<View>(R.id.account_profile).isShown&&!it.findViewById<View>(R.id.account_progress).isShown};if(!ready)Thread.sleep(100)}
                assertTrue("No se abrió Mi cuenta de comprador",ready)
                onView(withId(R.id.shop_form)).check(matches(withEffectiveVisibility(Visibility.GONE)))
                onView(withId(R.id.account_admin_web)).check(matches(withEffectiveVisibility(Visibility.GONE)))
                if(phase=="restore"){
                    onView(withId(R.id.account_logout)).perform(scrollTo(),click())
                    onView(withId(R.id.login_form)).check(matches(isDisplayed()))
                    assertNull(firebase.currentUser)
                    assertNull(repo.currentSession())
                }else leaveSession=true
            }
        }finally{if(!leaveSession)repo.signOut()}
    }
}
