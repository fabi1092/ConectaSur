# Verificación del hito 1

Fecha: 31 de octubre de 2026. Responsable: Benjamín Tampier.

## Alcance comprobado

Base Android con configuración Gradle, pantalla inicial y logo de ConectaSur. El hito 2 incorporará la navegación y las opciones de accesibilidad. El hito 3 incorporará las pruebas e informe de seguridad.

## Resultados locales

Se ejecutó desde `android`:

```sh
./gradlew assembleDebug lintDebug connectedDebugAndroidTest
```

- Compilación: `BUILD SUCCESSFUL`; APK de depuración generado.
- Prueba instrumentada: 1 ejecutada, 0 fallos y 0 omitidas. Comprueba el lanzamiento, el nombre accesible del logo y los textos principales.
- Dispositivo: emulador Pixel 7, Android 16 (API 36). No acredita el funcionamiento en todas las versiones admitidas.
- Android Lint: 0 errores y 3 advertencias. Dos avisan de versiones más recientes de dependencias y una solicita definir reglas de extracción de datos para Android 12 o superior. Revisar esta última antes de guardar información de cuentas en hitos futuros.

Los informes completos se generan en `app/build/reports` y los resultados de dispositivo en `app/build/outputs/androidTest-results`. No se versionan archivos de compilación.

## Límites y revisión pendiente

No hay autenticación, datos reales ni conexión a Firebase. La presencia de una etiqueta accesible no equivale a una evaluación con TalkBack o con las emprendedoras. La versión mínima API 26 es provisional.

Se añadió un flujo de GitHub Actions para compilar y ejecutar Lint, pero todavía no se ha ejecutado en GitHub. Un integrante distinto debe revisar el pull request antes de integrar a `main`.

## Estado del envío

El código está preparado en la rama local `feat/benjamin/hito-1-base-android`. El intento de crear esa rama mediante la conexión de GitHub respondió HTTP 403, `Resource not accessible by integration`. Git local tampoco dispone de autenticación para enviar. No se ha creado una rama remota ni un pull request.

Una vez habilitado el acceso de escritura, enviar esta rama y abrir un pull request que incluya solo este hito. No integrar todavía los hitos 2 y 3.
