# Acceso comprador con Google y Firebase

Google se implementa mediante Firebase Authentication en la web y Android. El catálogo, las tiendas, las ventas, los perfiles por correo y Storage continúan en Supabase. No se migran cuentas ni se utiliza Firestore.

## Recorrido

1. La aplicación abre el catálogo público sin exigir una cuenta.
2. En Ingresar, Continuar con Google abre el proveedor oficial: popup Firebase en web y Credential Manager en Android.
3. Firebase verifica la credencial de Google. La capa de datos comprueba el proyecto, emisor, sujeto, proveedor `google.com` y correo verificado.
4. La identidad abre Mi cuenta como comprador, con UID `firebase:UID`, sin tienda ni permisos administrativos. El nombre o correo de Google nunca conceden otro rol.
5. El SDK conserva la cuenta al reabrir; una interrupción de red no elimina sus credenciales. Cerrar sesión elimina el acceso local y cancela resultados pendientes.

Correo y contraseña siguen utilizando el perfil activo de Supabase para los tres roles. Se impide sustituir una sesión activa por otro proveedor desde el formulario. No se vinculan automáticamente cuentas que comparten correo entre Firebase y Supabase.

## Frontera de permisos

Las peticiones de una cuenta Firebase a Supabase usan únicamente la clave anon para datos públicos. No se envían ID tokens de Firebase como sesión de Supabase ni se escribe un perfil privilegiado en PostgreSQL. RLS y RPC existentes siguen protegiendo productos privados, ventas, tiendas y administración.

Esta integración cubre identificación del comprador y navegación pública. Para futuros datos privados del comprador, como seguidores o alertas guardadas, se necesitará una vinculación de identidad verificada en servidor o compatibilidad JWT configurada por el administrador. Eso no forma parte de este cambio.

## Configuración del equipo

- Web: completar `web/supabase-config.js` a partir del ejemplo. Incluir la configuración pública de la app web Firebase dentro de `firebase`; nunca incluir el secreto OAuth.
- Android: completar `android/firebase.properties` a partir del ejemplo con API key, app ID Android, project ID y client ID **web** de Google. La inicialización es explícita; no requiere el plugin google-services.
- En Firebase Authentication, habilitar Google, establecer nombre público y correo de asistencia, y autorizar el dominio web.
- Registrar en la app Android Firebase el SHA-1 de cada certificado usado para compilar (debug de cada equipo y certificado de distribución). El SHA de un equipo no habilita automáticamente los APK firmados por otro.
- Sin configuración Firebase se conserva el acceso por correo. Las compilaciones de demostración no incluyen configuración de ningún backend.

En `conectasur-dev` se verificó Google habilitado el 5 de noviembre de 2026 y se registró el SHA-1 debug del equipo de integración. El usuario autorizó el correo de asistencia público. Las configuraciones completas se excluyen de Git.

## Código y validación

Web: `firebase-buyer-auth.js` conecta el SDK; `firebase-buyer-session.js` controla identidad, cancelación y restauración; `supabase-data.js` integra ambos proveedores. Android: `GoogleAccountChooser`, `FirebaseBuyerAuth` y `SupabaseAuthRepository`; la interfaz conserva XML/Palette.

`security/firebase-buyer-session.test.mjs` comprueba proyecto/proveedor, rol fijo, rechazo de permisos privados, peticiones anon, conservación ante fallos de red, cancelación y cierre concurrente. Estas pruebas usan un proveedor controlado; no sustituyen una prueba real con Google.

Las pruebas Android de acceso común comprueban correo de comprador/emprendedora/admin, cierre, reapertura y catálogo visitante. `FirebaseGoogleAccessTest` es una prueba real optativa: requiere una credencial Google temporal emitida para el cliente del proyecto; queda omitida sin los argumentos explícitos. No debe habilitarse otro cliente OAuth solo para conseguir un resultado de prueba.

La selección real de Google en web y en un teléfono debe verificarse por separado. No se da por aprobada por haber compilado ni por llegar al selector. El problema de huella encontrado en la revisión anterior sigue abierto y no se corrige en este cambio.

## Dependencias

Android usa Firebase BOM 34.5.0 compatible con la versión Kotlin del proyecto; BOM 35.1.0 exigió metadatos Kotlin posteriores y no compiló. Web fija Firebase 13.2.0 y sobrescribe `@grpc/grpc-js` a 1.14.7 para retirar vulnerabilidades de la dependencia transitiva incluida por Firebase. La auditoría npm se ejecuta en CI.
