# ConectaSur

Aplicación de SurCode para conectar emprendedoras y compradores de Puerto Montt y Alerce.

## Avance actual: hito 3

Android en Kotlin y Views, con pantallas XML editables con Palette, capa de datos y reglas de Firebase. Incluye inicio, catálogo de ejemplo, detalle, tienda, ayuda, preferencias de accesibilidad, lectura opcional, repositorios para Firestore/Storage y pruebas automatizadas de seguridad por perfil. Nombres y precios son ficticios; las fotografías provienen de la visita.

Las pantallas finales de acceso, edición de productos, registro de ventas y panel web aún deben integrarse con el trabajo de los otros integrantes.

## Abrir en Android Studio

1. Abrir la carpeta real `android` del proyecto (en una ruta sin caracteres especiales ni tildes en Windows).
2. Usar JDK 21, SDK Android 36 y Build Tools 36.0.0; sincronizar Gradle.
3. Ejecutar `app` en un teléfono o emulador Android 8.0 o superior.

La versión mínima API 26 es provisional y debe contrastarse con los teléfonos de las emprendedoras. No se han probado todas las versiones Android.

## Editar con Palette

En la vista Android: `app > res > layout > screen_home.xml`. Seleccionar **Design** o **Split**. En Code no se muestra Palette.

`activity_main.xml` contiene la navegación y una inclusión de inicio para mostrarla en el editor. Las demás pantallas están en `screen_catalog.xml`, `item_product.xml`, `screen_detail.xml`, `screen_store.xml`, `screen_settings.xml`, `screen_help.xml`, `screen_sales.xml` y `dialog_menu.xml`.

El logo usa una subclase de ImageView para mostrar la variante horizontal del original. Si el editor necesita cargarla, compilar el proyecto. Kotlin contiene el comportamiento y XML distribuye los componentes. Si la vista se ve demasiado ampliada, usar Zoom to Fit.

## Compilar y comprobar (Android)

Desde la carpeta `android`:

```sh
./gradlew assembleDebug testDebugUnitTest lintDebug
./gradlew connectedDebugAndroidTest
```

En Windows se puede usar `gradlew.bat`. El APK queda en `app/build/outputs/apk/debug/app-debug.apk`. La primera compilación descarga dependencias. Las pruebas de dispositivo necesitan un emulador o teléfono conectado.

## Pruebas de reglas de seguridad (Firebase Emulator Suite)

Desde la raíz (requiere Node.js >=24.12.0 y JDK 21):

```sh
npm --prefix web ci
npm --prefix firebase ci
npm --prefix firebase test
```

Ejecuta **81 casos automatizados** sobre Authentication, Firestore y Storage: permisos por perfil, validación de productos/ventas, publicación y venta en transacción, y funciones reales de la capa web. Ver [informe y límites](docs/benjamin/hito-3-seguridad.md) y [evidencias](security/reports/verification.json).

Se corrigieron las alertas altas de las herramientas Firebase y la dependencia Guava de Android. Permanecen 17 alertas moderadas en herramientas de desarrollo, con alcance y seguimiento en el informe. La auditoría de las dependencias web no reporta alertas.

## Trabajo por hitos

1. Base Android y logo ([verificación](docs/benjamin/hito-1-verificacion.md)).
2. Pantallas, navegación y accesibilidad ([guía del hito 2](docs/benjamin/hito-2-pantallas.md)).
3. Pruebas e informe de seguridad ([informe de seguridad](docs/benjamin/hito-3-seguridad.md) y [modelo de datos](docs/felipe/modelo-datos.md)).

Cada hito se prepara y comprueba por separado, con mensajes de commit simples. El usuario solicitó enviar estos hitos directamente a main. Para cumplir la pauta del profesor, el equipo debe acordar la protección de main y el flujo de pull requests revisados; no se declara cumplido ese criterio con este envío.

Fabián se encarga de acceso y tienda; Dan de productos; Alonso de ventas; Felipe de Firebase y Kisho del panel web. Benjamín desarrolla la base, navegación, accesibilidad y pruebas de seguridad. Todos deben registrar sus propias contribuciones.

## Datos y permisos

Sin `android/app/google-services.json`, la app usa datos locales de demostración y guarda preferencias visuales y una referencia local al logo elegido. `allowBackup=false` deshabilita Auto Backup; las reglas explícitas de extracción y transferencia incluyen únicamente `presentation.xml`. El selector del sistema permite elegir una imagen sin acceso general al almacenamiento. La lectura usa una voz instalada y comienza solo al pulsar Escuchar.

La capa web usa caché en memoria y sesión de navegador por pestaña para reducir la persistencia en equipos compartidos. Falta integrar y verificar el panel visual. Las reglas actuales validan hasta 10 variantes por producto; el editor debe respetar ese límite técnico o migrar las variantes a documentos separados.

No subir `local.properties`, `google-services.json`, `firebase-config.json`, claves privadas, contraseñas, archivos de firma ni archivos generados de build.
