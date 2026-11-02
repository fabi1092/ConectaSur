# ConectaSur

Aplicación de SurCode para conectar emprendedoras y compradores de Puerto Montt y Alerce.

## Backend actual: Supabase

Desde el 1 de noviembre se utiliza la instancia del grupo entregada por el profesor: PostgreSQL, Auth y Storage. Android y web consumen la API con la clave anon y la sesión del usuario. El código activo ya no utiliza Firebase/Firestore.

Android mantiene Kotlin y Views con XML editables en Design/Palette, navegación simple, ajustes de letras/botones, contraste, lectura opcional y precios en pesos chilenos. El catálogo y la ficha pública consultan Supabase; las fotografías de ejemplo están alojadas en Storage. Los nombres y precios de esos ejemplos son ficticios.

El acceso Android, cierre de sesión, huella opcional y edición de datos/logo de la tienda se implementan en StoreActivity. Ver [entrega de Fabián](docs/fabian/acceso-tienda.md) para configuración y verificación. Las pantallas finales de edición de productos, ventas y panel web siguen bajo responsabilidad de sus integrantes. Sus repositorios y la operación de venta ya están conectados y probados; la migración del backend no significa que esas pantallas pendientes estén terminadas.

## Configuración local

1. Abrir la carpeta real **android** en Android Studio. Usar JDK 21, SDK 36, Build Tools 36.0.0; mínimo provisional Android 8/API 26.
2. Copiar android/supabase.properties.example a android/supabase.properties y completar únicamente URL y anon key.
3. Para la web, ejecutar npm ci en web y copiar supabase-config.example.js a supabase-config.js.
4. Importar la configuración local y llamar configureSupabase(config) antes de usar la capa web.

Los archivos completos de configuración se excluyen de Git. Las credenciales de Studio, contraseñas y service_role no forman parte de los clientes. Cada usuario debe iniciar sesión con su propia cuenta de la aplicación.

Sin configuración Android se abre una demostración local. Para forzarla en pruebas se usa -PconectaDemo=true. Una conexión fallida al backend configurado muestra el estado de conexión y conserva el catálogo público previamente descargado; no cambia silenciosamente a productos ficticios.

## Compilar y probar Android

Desde android:

~~~sh
./gradlew assembleDebug testDebugUnitTest lintDebug
./gradlew -PconectaDemo=true connectedDebugAndroidTest
~~~

En Windows: gradlew.bat. El APK queda en app/build/outputs/apk/debug/app-debug.apk. La segunda orden verifica la navegación con datos de demostración; las pruebas reales se habilitan expresamente y necesitan una cuenta ficticia mediante argumentos del runner, nunca credenciales incluidas en el APK.

## Backend y pruebas

- [Modelo de datos y permisos](docs/felipe/modelo-datos.md).
- [Informe de seguridad vigente](docs/benjamin/hito-3-seguridad.md).
- [Migración y cambios de integración](docs/migracion-supabase.md).
- [Guía de conexión para el equipo](docs/integracion-supabase.md).

~~~sh
npm --prefix supabase ci
npm --prefix web ci
~~~

npm test en supabase ejecuta pruebas de RLS/RPC en un PostgreSQL desechable local llamado conectasur_test, con TEST_DATABASE_URL. GitHub Actions crea ese entorno sin utilizar las credenciales del profesor.

npm run test:live en supabase verifica Auth, API, RLS, Storage y la capa web contra la instancia del grupo. Requiere configuración privada y credenciales ficticias. Cada ejecución crea fixtures propios y los limpia al terminar.

Los informes antiguos de Firebase se conservan en docs/historico como evidencia de los hitos anteriores; sus resultados no se presentan como pruebas de Supabase. El proyecto Firebase remoto no se ha eliminado.

## Editar con Palette

Abrir app > res > layout > screen_home.xml y seleccionar Design o Split. activity_main.xml contiene la navegación y una inclusión de inicio para el editor. Los demás XML siguen en res/layout.

La lectura comienza al pulsar Escuchar; TalkBack y el dictado son ayudas distintas. Los textos respetan el tamaño del sistema y los ajustes locales.

## Trabajo por hitos

Mensajes de commit simples y avances separados. Benjamín solicitó enviar los hitos a main. La pauta pide protección de main, PR revisados y contribuciones propias: ese criterio de colaboración debe verificarse con el equipo.

Fabián: acceso/tienda; Dan: productos; Alonso: ventas; Felipe: backend; Kisho: web; Benjamín: base Android, accesibilidad y pruebas. Los contratos de dominio se mantienen y los adaptadores se llaman SupabaseAuthRepository, SupabaseShopRepository, SupabaseProductRepository y SupabaseSalesRepository.

El cambio de Firestore a Supabase responde a la instrucción del grupo tras recibir la instancia del profesor y queda documentado expresamente.
