# Integración Supabase para el equipo

## Configuración del grupo

Cada integrante copia los archivos example y completa localmente URL y anon key del correo del profesor:

- android/supabase.properties.example → android/supabase.properties
- web/supabase-config.example.js → web/supabase-config.js

Esos archivos se ignoran en Git. Studio Basic Auth se utiliza únicamente para administrar la instancia; no se pone en Android, web ni variables públicas del sitio. El cliente no utiliza service_role.

La instancia ya tiene el modelo y los datos ficticios. No volver a ejecutar la migración manualmente para crear tablas duplicadas. tools/admin.mjs migrate comprueba su registro antes de aplicar; para cambios posteriores crear una migración nueva.

## Fabián: acceso y tienda Android

MainActivity ya inicializa RepositoryProvider con el contexto. Desde otro punto de entrada:

~~~kotlin
RepositoryProvider.initialize(applicationContext)
val session = RepositoryProvider.auth().signIn(email, password)
val shop = RepositoryProvider.shops().getShop(requireNotNull(session.shopId))
~~~

Las funciones suspend se invocan desde lifecycleScope. currentSession verifica el perfil activo y renueva el token cuando corresponde. El cierre de sesión limpia los tokens y la caché privada; los borradores permanecen cifrados para la misma cuenta.

StoreActivity implementa el acceso y cierre de sesión, el formulario de tienda y el selector de logos con conversión a JPEG hasta 2 MiB antes de llamar uploadLogo. La huella opcional usa BiometricPrompt y una clave de Android Keystore ligada a autenticación por operación. Ver [acceso y tienda de Fabián](fabian/acceso-tienda.md) para detalles y pruebas.

## Dan: productos y variantes

Mantener el contrato ProductRepository. saveProduct hace upsert en products; las vistas públicas reflejan el cambio automáticamente. No escribir public_products: es una vista de solo lectura.

El modelo añade productType y attributes, y las variantes admiten precio/foto opcionales. El servidor normaliza el stock total y valida hasta 100 opciones con IDs distintos.

SupabaseProductRepository guarda el producto como borrador cifrado si falla la red y lanza PendingProductException con un mensaje explícito. pendingDrafts(shopId) permite restaurar el editor. Al consultar ownerProducts, flushPending reenvía los borradores de esa cuenta al volver la red. Un rechazo de validación/permisos se debe mostrar para que la persona corrija el borrador; no borrar sus datos al mostrar el error.

## Alonso: ventas

Llamar registerSale(shopId, productId, variantId, quantity, place). El cliente no escribe sales ni descuenta cantidades en llamadas separadas.

El RPC bloquea el producto, valida stock/variante y toma el precio desde la base. La operación conserva un UUID de reintento ante una respuesta incierta. Cada operación confirmada nueva obtiene su propio UUID. El historial se consulta por history(shopId), ordenado por fecha, respetando el permiso de la dueña.

Las ventas requieren conexión; una falla de red no se presenta como venta confirmada. El recibo protege un reintento manual de esa misma operación.

## Kisho: web

~~~javascript
import config from './supabase-config.js';
import { configureSupabase, login, listShops } from './supabase-data.js';

configureSupabase(config);
await login(email, password);
const shops = await listShops();
~~~

Los nombres de las funciones anteriores se conservan: createEmprendedora, setEmprendedoraActive, saveAssociation, listAssociations, addShopToAssociation, removeShopFromAssociation, saveListItem, listItems, getShop, updateShop y watchPublicProducts.

createEmprendedora crea una identidad con un cliente temporal y llama al RPC administrativo de aprovisionamiento. Conserva la sesión del administrador y cierra el cliente temporal. Si el segundo paso falla, puede quedar una identidad con perfil comprador: requiere reconciliación por el administrador; no obtiene permisos de emprendedora.

createDataLayer(config) permite una instancia explícita para pruebas. Incluye uploadLogo, registerSale, salesHistory y listAdminActions. Devolver y ejecutar los unsubscribe de onSession/watchPublicProducts al desmontar las pantallas. El catálogo se consulta cada 15 segundos; no se usa Realtime.

## Felipe: base de datos y operación

- Modelo y permisos: docs/felipe/modelo-datos.md.
- SQL versionado: supabase/migrations.
- Ventas: RPC register_sale. RLS, triggers, constraints y auditoría permanecen en el servidor.
- Usuarios: auth.users y profiles comparten UUID. Las cuentas nuevas reciben rol comprador; solo un admin de aplicación aprovisiona emprendedoras.
- Storage: bucket shop-images y primera carpeta igual a shop_id.
- Google está deshabilitado en la configuración actual del servidor. Su habilitación OAuth requiere coordinación con el profesor y los datos del proveedor; no se resuelve cambiando anon key.
- La autenticidad de la aplicación/dispositivo equivalente a App Check sigue pendiente; RLS y Auth controlan usuarios, no acreditan la integridad del APK.

## Benjamín: pruebas y cuentas locales

Las credenciales de clase recibidas y las cuentas ficticias creadas están cifradas con Windows DPAPI fuera del repositorio, en el perfil local de Benjamín. El lanzador local-access.ps1 permite ejecutar herramientas o ver las cuentas de demostración desde ese equipo; los otros integrantes utilizan las credenciales privadas del grupo, sin copiarlas al repositorio.

Las pruebas de API real necesitan acceso de Studio solo para preparar/limpiar fixtures. Todas las operaciones bajo prueba se realizan con anon y JWT de cada perfil. El panel de Studio no sirve como prueba de los permisos de una emprendedora.

La migración no elimina los datos de Firebase. Los ejemplos se recrearon en Supabase con nuevos UUID y contraseñas ficticias; una migración futura de datos reales debe usar exportación, mapeo de identificadores y verificación específica.
