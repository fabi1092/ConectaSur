# ConectaSur

Aplicación de SurCode para conectar emprendedoras y compradores de Puerto Montt y Alerce.

## Backend actual: Supabase

Desde el 1 de noviembre se utiliza la instancia del grupo entregada por el profesor: PostgreSQL, Auth y Storage. Android y web consumen la API con la clave anon y la sesión del usuario. El código activo ya no utiliza Firebase/Firestore.

Android mantiene Kotlin y Views con XML editables en Design/Palette, navegación simple, ajustes de letras/botones, contraste, lectura opcional y precios en pesos chilenos. El catálogo y la ficha pública consultan Supabase; las fotografías de ejemplo están alojadas en Storage. Los nombres y precios de esos ejemplos son ficticios.

El acceso Android, cierre de sesión, huella opcional y edición de datos/logo de la tienda se implementan en StoreActivity. Ver [entrega de Fabián](docs/fabian/acceso-tienda.md) para configuración y verificación. El panel web administrativo también está integrado. Los productos, el flujo guiado con borradores recuperables, las variantes, la disponibilidad, las ventas y el historial también están integrados. Ver la [Entrega 5](docs/entrega-5/informe.md).

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

## Presentación del 2 de noviembre

Los avances publicados por el equipo se reunieron en main. Ver [estado de integración y recorrido](docs/presentacion-2-noviembre.md).

Para abrir el panel: usar Node 24.12 o superior; en web ejecutar npm ci y npm run dev. Abrir la dirección local que indique Vite. La configuración privada de cliente debe estar en web/supabase-config.js. Para generar la versión estática: npm run build; para probarla: npm run preview.

En Android, Mi tienda permite entrar con una cuenta de emprendedora, editar la ficha, cambiar el logo y cerrar sesión. Las cuentas administradoras utilizan el panel web.

## Entrega 5: catálogo, productos y ventas

Panel publicado: https://conectasur-dev.web.app

La portada y las fichas de tienda se pueden consultar sin cuenta. Para consultar o modificar datos administrativos se exige el inicio de sesión de administrador de ConectaSur. No incluye contraseñas de demostración.

Revisión de Entrega 4 del 4 de noviembre: [bloque 1, ficha pública de tienda](docs/entrega-4/ficha-publica.md). La portada abre en la URL principal; cada ficha tiene un enlace `#tienda/ID`. El único acceso de cuenta es **Ingresar** (`#ingresar`): el rol validado en Supabase abre la tienda propia o el panel administrativo.

[Bloque 2, acceso de cuentas](docs/entrega-4/acceso-emprendedoras.md): la emprendedora ingresa con las credenciales creadas por el administrador, consulta la tienda propia y cierra sesión. La edición de su ficha se realiza en Android. Los enlaces anteriores `#mi-tienda` y `#administracion` abren el mismo acceso y respetan el rol de la cuenta.

En Android: Inicio → Mi tienda → ingresar con una cuenta de emprendedora → Mis productos / Registrar una venta / Historial de ventas. Las preferencias de productos e historial se abren desde Mis productos. La app abre el catálogo público sin preguntar un rol ni pedir huella al inicio.

- [Informe breve, alcance y reparto](docs/entrega-5/informe.md).
- [Requisitos y criterios de aceptación](docs/entrega-5/requisitos.md).
- [Informe de seguridad y hallazgos](docs/entrega-5/seguridad.md).
- [Cambios respecto del prototipo](docs/entrega-5/cambios-prototipo.md).

Migraciones: npm run migrate desde supabase con las variables privadas del desarrollador. El migrador comprueba hashes y aplica solo las pendientes; no se edita una migración aplicada.

Pruebas SQL aisladas: npm test en supabase con TEST_DATABASE_URL de una base local vacía conectasur_test. Pruebas de servicios reales: npm run test:live en supabase con CONECTASUR_PRIVATE configurado en memoria. En el computador de Benjamín, supabase/tools/local-access.ps1 -Action test carga la configuración cifrada local.

Pruebas Android: ./gradlew assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug. Entrega5Test, StoreAccessTest y LaunchTest se ejecutan con el runner AndroidJUnitRunner en un emulador con supabaseLive=true y una cuenta ficticia por argumentos testEmail/testPassword. Para la navegación local: ./gradlew -PconectaDemo=true -Pandroid.testInstrumentationRunnerArguments.class=cl.surcode.conectasur.LaunchTest,cl.surcode.conectasur.NavigationTest connectedDebugAndroidTest.

El workflow Analisis MobSF analiza el APK en un contenedor del runner y guarda el informe como artefacto. No se sube el APK a un analizador público ni se incluyen credenciales de Supabase en el APK de CI.
