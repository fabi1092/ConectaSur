# Sesión conservada al volver

Cambio del 3 de noviembre de 2026 solicitado por el equipo: cerrar una pestaña, cerrar el navegador o salir de Android no equivale a Cerrar sesión.

## Comportamiento

- En el mismo navegador y perfil, comprador, emprendedora y administrador vuelven a su cuenta sin escribir otra vez la contraseña. La portada sigue siendo pública y muestra Mi cuenta, Mi tienda o Mi panel según el perfil comprobado.
- La web utiliza localStorage para los tokens gestionados por Supabase y renueva el acceso cuando vence el token corto. No guarda la contraseña. La sesión anterior en sessionStorage se migra una vez; un marcador evita restaurar una copia antigua después de Cerrar sesión.
- Cerrar sesión elimina los tokens persistentes. Otras pestañas retiran sus pantallas privadas al recibir el cambio. El alta de una emprendedora utiliza una sesión secundaria aislada, sin cambiar la sesión administradora.
- Un fallo temporal de red o del servidor no borra la sesión guardada. Se muestra un error y se permite reintentar; no se concede acceso privado sin comprobar los permisos. Las sesiones inválidas y cuentas desactivadas siguen siendo rechazadas.
- Android ya conserva los tokens cifrados mediante SecureBackendStore y Android Keystore. Un cliente y un StoreViewModel nuevos recuperan la cuenta/tienda. La huella opcional protege el acceso a la tienda sin cerrar la sesión guardada.

La persistencia depende de conservar los datos de la app/navegador. Borrarlos, desinstalar, usar navegación privada, revocar una sesión o desactivar una cuenta puede exigir un nuevo ingreso. Las políticas del servidor pueden finalizar sesiones por razones de seguridad. Referencia: [sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions).

## Verificación

security/session-persistence-check.mjs usa un perfil temporal de Chromium, cierra completamente el proceso y lo vuelve a abrir para los tres roles. Comprueba también renovación real de tokens, salida explícita, salida entre pestañas, migración de sesión anterior, rechazo de copia antigua, cuenta desactivada y un 503 de perfil simulado. Crea y elimina sus cuentas/tienda ficticias. SESSION_ACCESS_URL permite repetir contra la URL publicada.

security/android-session-check.mjs instala el build de prueba en el emulador y ejecuta SessionPersistenceTest en dos procesos separados por force-stop. Usa un almacén cifrado con nombre propio y una cuenta ficticia; verifica recuperación del usuario, tienda, renovación real y salida. No usa ni reemplaza la sesión personal del emulador. Requiere assembleDebug, assembleDebugAndroidTest, CONECTASUR_PRIVATE solo en memoria y un emulador conectado.

Resultados y límites quedan en security/reports/session-persistence/web.json y android.json. Android se comprueba en emulador, no en teléfono físico. Esta corrección no cambia la conservación de solicitudes de venta pendientes: su identificador continúa en sessionStorage de la pestaña, como se explica en el hito de ventas.

Resultado del hito: 15 comprobaciones web aprobadas tanto en local como en https://conectasur-dev.web.app, cinco comprobaciones Android aprobadas en dos ejecuciones de instrumentación separadas por force-stop y 16 de regresión del registro/acceso de compradores en local. Vite y las compilaciones Android de aplicación y pruebas terminaron correctamente. Los fixtures se eliminaron al terminar. La web publicada respondió HTTP 200 y sirvió los archivos de la compilación verificada.
