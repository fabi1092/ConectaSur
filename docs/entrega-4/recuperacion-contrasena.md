# Recuperación de contraseña por correo

Hito W27 del checklist web. Se incorpora Olvidé mi contraseña al acceso común y un recorrido accesible de tres pasos: correo, enlace y contraseña nueva. Sirve para comprador y emprendedora; el perfil y su tienda no cambian al recuperar la cuenta.

## Uso actual sin cambiar el servidor del profesor

1. Abrir https://conectasur-dev.web.app/#ingresar y elegir Olvidé mi contraseña.
2. Escribir el correo y pulsar Enviar enlace al correo. El mensaje de respuesta no confirma si existe una cuenta.
3. Abrir el mensaje en el correo. En celular, mantener presionado el botón de recuperación y elegir Copiar enlace. En computador, clic derecho y Copiar dirección del enlace.
4. Volver a ConectaSur, pegar en Enlace del correo y pulsar Comprobar enlace.
5. Revisar el correo mostrado, escribir y repetir la contraseña nueva y guardar. Ingresar con la nueva contraseña; la anterior deja de funcionar. La misma contraseña nueva sirve en Android porque utiliza el mismo Auth.

Ya tengo el enlace permite continuar con un mensaje recibido anteriormente. Las instrucciones para copiar/pegar se pueden desplegar y escuchar. Se mantienen tamaño de letra, contraste, etiquetas y controles grandes. No se lee el contenido del enlace ni los valores de contraseña.

## Motivo de esta alternativa y límite externo

La instancia acepta solicitudes de recuperación y genera el desafío, pero ignora redirectTo hacia nuestra web: /auth/v1/verify devuelve un 303 cuyo destino es https://surcode.supabase.codepulse.cl. Esto se comprobó con una cuenta ficticia propia y también con solicitudes de enlace inválido hacia las variantes de dominio de Firebase Hosting. El usuario indicó que no puede pedir ahora el cambio al profesor.

Por eso se implementó pegar el enlace: se extrae el desafío del botón del correo y se verifica con Supabase en la instancia actual, sin navegar al dominio antiguo. Se aceptan el host actual de SurCode, su alias antiguo conocido y el envoltorio Safe Links de Outlook. Nunca se sigue ni se solicita una URL arbitraria pegada.

La apertura automática del botón queda preparada para el retorno estándar con fragmento de recuperación, pero sigue pendiente que el profesor autorice https://conectasur-dev.web.app/** en GOTRUE_URI_ALLOW_LIST. No se modificó su infraestructura ni se solicitó service_role. Referencia de implementación: [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Capa de datos y sesiones

Las pantallas usan db.passwordRecovery(), que crea un cliente temporal sin persistencia y con clave de almacenamiento aislada. verifyOtp valida el desafío de recuperación de un solo uso; los fragmentos de retorno directo se validan mediante setSession/getUser. Se comprueba el perfil activo antes de permitir el cambio.

updateUser cambia la contraseña confirmada por el servidor y se solicita revocar las sesiones anteriores de esa cuenta. Un error posterior de revocación no se presenta como contraseña sin guardar. La sesión de otra cuenta abierta no se sustituye durante el proceso. La acción final Ingresar con la nueva contraseña cierra la sesión local que hubiera y abre el formulario de ingreso.

Los tokens de recuperación, enlaces y contraseñas no se guardan en localStorage ni sessionStorage. Los fragmentos de la URL se retiran del historial antes de renderizar. Las consultas administrativas de pruebas no forman parte del cliente web. No hay cambios de esquema ni de RLS.

## Pruebas y límites

security/password-recovery-check.mjs crea y elimina cuentas/tienda ficticias propias. Solicita recuperación real, obtiene el desafío por SQL solo para esas cuentas para simular copiar el enlace y prueba cambios reales de contraseña en Auth. Comprueba rechazo de contraseña anterior, rol conservado, enlace de un solo uso, dominio ajeno, alias antiguo con Outlook, errores, lectura sin secretos, sesión distinta preservada y celular con texto grande/contraste. La voz y los 503 son simulados.

El retorno directo se prueba con tokens reales adaptando únicamente el destino del navegador: esto no demuestra que el servidor ya redirija a nuestra web. La evidencia registra directRedirectReady=false mientras exista la limitación externa.

Resultados y capturas: security/reports/password-recovery/. RECOVERY_URL permite ejecutar contra la publicación. Se verificó aceptación de envío y generación del desafío; no se comprobó entrega a un buzón real. La revisión móvil es emulada, sin prueba física de teléfono ni ensayo con usuarias. Google continúa pendiente y este hito no cierra toda la entrega.

Resultado del hito: 17 comprobaciones aprobadas en local y 17 en https://conectasur-dev.web.app, revisión de capturas de escritorio/celular y compilación Vite correcta. La publicación respondió HTTP 200 y sirvió los mismos archivos de la compilación final. Los fixtures se eliminaron al terminar; no se cambiaron contraseñas de cuentas reales del equipo. El informe publicado conserva directRedirectReady=false y el límite de entrega a buzón sin verificar.
