# Acceso del comprador desde la web

Hito del 3 de noviembre de 2026. Cubre W29 (registro con correo y contraseña), W30 (ingreso), W31 (cierre de sesión) y conserva W32 (visita sin registro) del checklist de revisión del 4 de noviembre. El backend utilizado es Supabase; esta equivalencia con los puntos que nombran Firebase debe confirmarse con el profesor.

## Recorrido

1. Abrir https://conectasur-dev.web.app/#ingresar y elegir Crear cuenta de comprador.
2. Escribir nombre, correo y una contraseña de al menos ocho caracteres. Repetir la misma contraseña. Mostrar contraseñas permite revisar ambas de forma voluntaria.
3. Crear mi cuenta abre Mi cuenta cuando Auth entrega una sesión válida. En la instancia de clase el profesor habilitó la autoconfirmación de correo: este recorrido no demuestra propiedad del correo. Si el servidor entrega una respuesta sin sesión, se pide revisar el correo o ingresar con la cuenta existente; no se muestra una sesión ficticia.
4. Explorar productos o conocer las tiendas. La cabecera cambia de Ingresar a Mi cuenta y permite volver con un clic, también al recargar la misma pestaña.
5. Cerrar sesión y recargar. Se vuelve a pedir el acceso. El mismo formulario de Ingresar reconoce también emprendedoras y administradores según el perfil del servidor.

La cuenta de comprador no tiene tienda ni panel administrativo. Registrarse no convierte una cuenta en emprendedora. No se incluyen compras en línea, carrito, favoritos o seguimiento en este hito.

## Implementación y permisos

Las pantallas llaman a registerBuyer/login/currentSession/logout de la capa de datos web; no consultan directamente al SDK. Solo se envía display_name como metadato del registro. El trigger existente crea profiles con rol comprador y sin shop_id. Los permisos efectivos dependen de RLS, no de enlaces ocultos. No se cambió el esquema ni se desplegaron nuevas políticas.

Se valida la repetición de contraseña y se impide enviar dos veces mientras el registro está pendiente. Un fallo conserva los datos para reintentar y no afirma que la cuenta se haya creado. Una sesión abierta no puede ser sustituida por otro registro. Los tokens se mantienen en sessionStorage mediante Supabase: recargar conserva la sesión en la pestaña, sin prometer permanencia al cerrar el navegador. Las contraseñas no se guardan en archivos, informes ni localStorage.

Se mantiene la guía visual, controles grandes, foco, etiquetas, aumento de texto, contraste y lectura de instrucciones. La lectura guiada no incluye los valores de los campos de contraseña. En celular con letras ampliadas los controles de contraste y ayudas ocupan una fila completa para evitar palabras partidas.

## Verificación

security/buyer-access-check.mjs crea y elimina dos cuentas ficticias propias. Comprueba registro e ingreso reales, correo duplicado, errores, salida, restauración de sesión, navegación pública, rutas por perfil, rechazo de acceso a inventario/ventas privados y rechazo de elevación de rol, incluso enviando metadatos manipulados. Simula únicamente un fallo 503 y una respuesta sin sesión para comprobar sus mensajes. Evidencia en security/reports/buyer-access/verification.json y sus capturas.

Para repetir: iniciar Vite en el puerto 5174, cargar CONECTASUR_PRIVATE solo en memoria, indicar PLAYWRIGHT_MODULE si corresponde y ejecutar node security/buyer-access-check.mjs. BUYER_ACCESS_URL permite probar la web publicada. La suite de regresión de emprendedoras/administración es security/entrepreneur-access-check.mjs.

Resultado: 16 comprobaciones de compradores aprobadas en local y en la URL pública, 21 de regresión de emprendedoras/administración en local y compilación Vite correcta. Se revisaron las capturas de escritorio y celular. La publicación respondió HTTP 200 y sirvió los mismos archivos de la compilación verificada. Las cuentas temporales se eliminaron al terminar cada ejecución.

La emulación móvil no sustituye pruebas en un teléfono físico ni una evaluación con usuarias. Google (W28) y recuperación de contraseña (W27) permanecen pendientes; este hito no cierra todo el checklist.
