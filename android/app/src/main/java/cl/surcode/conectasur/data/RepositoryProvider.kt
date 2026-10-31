package cl.surcode.conectasur.data

import android.content.Context
import cl.surcode.conectasur.domain.*
import com.google.firebase.FirebaseApp

/**
 * Punto unico para obtener repositorios.
 * - Con android/app/google-services.json: usa Firebase.
 * - Sin ese archivo (por ejemplo en GitHub Actions): usa los datos de demostracion y la app no se cae.
 *
 * Fabian/Dan/Alonso: llamen firebaseReady(context) antes de pedir auth(), shops(), products() o sales().
 */
object RepositoryProvider {
    fun firebaseReady(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

    fun catalog(context: Context): CatalogRepository =
        if (firebaseReady(context)) FirebaseCatalogRepository() else DemoCatalogRepository()

    fun auth(): AuthRepository = FirebaseAuthRepository()
    fun shops(): ShopRepository = FirebaseShopRepository()
    fun products(): ProductRepository = FirebaseProductRepository()
    fun sales(): SalesRepository = FirebaseSalesRepository()
}
