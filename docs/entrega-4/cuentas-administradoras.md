# Cuentas administradoras — W23 / RF-ADM-04

Desde el acceso común de ConectaSur, una cuenta administradora activa abre el panel. La nueva sección **Administradores** permite crear otra cuenta, editar su nombre, desactivarla y volver a activarla. Incluye búsqueda por nombre o correo y filtro de estado. Conserva la marca, los controles de al menos 48 px y las ayudas de tamaño, contraste e instrucciones escuchables.

## Recorrido para la revisión

1. Ingresar con una cuenta administradora y abrir Administradores.
2. Crear administrador: completar nombre, correo nuevo y contraseña de al menos ocho caracteres.
3. Confirmar que el administrador original mantiene su sesión. Guardar y entregar de forma privada los datos mostrados para la cuenta nueva; la contraseña aparece oculta y solo se copia mediante una acción explícita.
4. Volver a la lista y buscar la cuenta. Editar su nombre, guardar y recargar para comprobarlo.
5. Desactivar esa otra cuenta y comprobar que no accede al panel. Activarla de nuevo y verificar el ingreso.

La cuenta propia aparece identificada y no ofrece desactivación. El servidor también impide esa acción, aunque se intente evitando la pantalla. No hay borrado ni cambio de rol: el estado inactivo conserva la identidad y permite reactivación. La edición de este hito cambia el nombre, no el correo ni la contraseña de otra persona.

## Datos y seguridad

La migración 006_cuentas_administradoras.sql agrega tres funciones: list_platform_admins, provision_platform_admin y update_platform_admin. Todas verifican en el servidor que el actor tenga rol admin y esté activo. La lista devuelve únicamente identificador, nombre, correo, estado y fecha; no devuelve contraseñas. Los correos de Auth solo se consultan mediante esta función administrativa.

Se revocan INSERT/UPDATE/DELETE directos sobre profiles al rol authenticated. El alta inicial sigue en el trigger de Auth y los cambios administrativos pasan por funciones de alcance limitado. Los RPC existentes de alta y activación de emprendedoras continúan funcionando. No se utiliza ni se solicita service_role en los clientes.

El registro utiliza una sesión secundaria en memoria con una clave de almacenamiento independiente. Una cuenta nueva comienza como comprador y solo el administrador actual puede promoverla. El servidor comprueba el UUID de solicitud asociado a esa alta en Auth: escribir metadatos por sí solo no concede privilegios. No se busca ni se promociona una cuenta existente por su correo.

app_private.admin_creation_requests vincula solicitud, actor, cuenta creada y nombre. Un reintento idéntico devuelve el resultado sin crear otra cuenta ni deshacer modificaciones posteriores. Las escrituras de administradores comparten un bloqueo transaccional y vuelven a verificar al actor después de esperar: dos bajas simultáneas no deben eliminar todos los accesos activos. También hay una guarda de último administrador, validación de nombres y control de edición concurrente. Los cambios de perfil generan los registros de auditoría existentes.

Desactivar bloquea las funciones administrativas y las políticas RLS inmediatamente, incluso con un token emitido antes. Un panel ya abierto comprueba el perfil al recuperar el foco o realizar una operación. La desactivación no equivale a borrar el usuario de Auth ni a invalidar físicamente cada token. Las vistas públicas siguen disponibles.

## Interrupciones y límites

- Si se pierde la respuesta de Auth, el reintento recupera únicamente el alta de esta solicitud; si no llegó a crearse, puede repetir el registro. Nunca convierte una cuenta ajena.
- Si se pierde la respuesta del cambio de perfil, el mismo formulario conserva la solicitud para terminar sin duplicar. Mientras esté pendiente no permite cambiar los datos del alta.
- Salir de un formulario con cambios, alta pendiente o datos de acceso aún visibles pide confirmación. Una interrupción completa puede dejar un perfil comprador sin promoción: Auth y PostgreSQL no forman una única transacción. No se implementa eliminación privilegiada automática de cuentas.
- La contraseña no se guarda en almacenamiento web, HTML ni informes; el cliente solo la conserva en memoria mientras se crea y entrega la cuenta. Los tokens de sesión mantienen su persistencia habitual.
- La recuperación de contraseña y las restricciones actuales del servidor se documentan por separado; este hito no habilita cambios de contraseña de terceros.

## Verificación reproducible

security/admin-accounts-check.mjs prueba API real y navegador con cuentas temporales propias, que elimina al terminar. ADMIN_ACCOUNTS_URL permite ejecutar el mismo recorrido sobre la publicación. El informe y las capturas están en security/reports/admin-accounts/verification.json y la misma carpeta. Se simulan fallos de respuesta y el portapapeles; la creación, promoción, edición, desactivación, lectura y permisos utilizan Supabase real.

supabase/test/sql.test.js incorpora pruebas de funciones, permisos directos, cuenta inactiva, idempotencia y auditoría. Puede ejecutarse en PostgreSQL desechable local/CI; para una comprobación local en memoria admite SQL_TEST_PGLITE_MODULE con la ruta al módulo PGlite instalado fuera del repositorio. En PGlite se omite la prueba de dos conexiones simultáneas; GitHub Actions la ejecuta sobre PostgreSQL 15. No se desactivan cuentas reales para probar el último administrador.

El navegador se revisa a 1440, 390 y 320 px, incluyendo letra grande y alto contraste. Esto no sustituye una prueba física con usuarias, TalkBack o micrófono.

Resultado del 3 de noviembre de 2026: 13 comprobaciones del recorrido aprobadas en local y en https://conectasur-dev.web.app; 26 pruebas SQL aisladas aprobadas en PGlite y una prueba de concurrencia reservada al PostgreSQL de CI. También aprobaron 21 comprobaciones del acceso de emprendedoras/administración, 15 de sesiones persistentes y siete de la capa web real. La compilación Vite terminó correctamente y Hosting respondió HTTP 200 con los mismos archivos compilados. Se revisaron las capturas y se ajustó el título para texto ampliado a 320 px. Los fixtures se eliminaron al terminar.

Referencias técnicas: [registro de Supabase](https://supabase.com/docs/reference/javascript/auth-signup), [permisos de funciones](https://supabase.com/docs/guides/database/functions) y [PGlite para pruebas aisladas](https://pglite.dev/docs/).
