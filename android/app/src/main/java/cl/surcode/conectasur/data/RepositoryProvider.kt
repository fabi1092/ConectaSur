package cl.surcode.conectasur.data

import android.content.Context
import cl.surcode.conectasur.BuildConfig
import cl.surcode.conectasur.domain.*

/** Una instancia y una sesion compartidas. Sin configuracion se utiliza la demostracion. */
object RepositoryProvider {
    private var backend: SupabaseClient? = null
    @Synchronized fun initialize(context: Context) {
        if (backend == null && supabaseReady()) backend = SupabaseClient(
            BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY, SecureBackendStore(context.applicationContext))
    }
    fun supabaseReady() = BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()
    private fun client() = checkNotNull(backend) { "Inicializa RepositoryProvider con el contexto de la aplicacion" }
    fun catalog(context: Context): CatalogRepository {
        initialize(context)
        return if (supabaseReady()) SupabaseCatalogRepository(client()) else DemoCatalogRepository()
    }
    fun auth(): AuthRepository = SupabaseAuthRepository(client())
    fun shops(): ShopRepository = SupabaseShopRepository(client())
    fun ownerWorkspace() = OwnerWorkspaceRepository(client())
    fun products(): ProductRepository = SupabaseProductRepository(client())
    fun sales(): SalesRepository = SupabaseSalesRepository(client())
}
