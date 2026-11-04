# Parte 2: demo Android, Google y backend

## Commits por bloque

Cada cambio se entrega con sus pruebas en un commit independiente: asociación de tienda (AA4), retorno Google Android, controles de comprador Android (A09/A10/A12), Google web (W28) y preparación de demo (B01-B13). Los cambios se revisan en la rama `fabian-parte-2`.

## Datos Supabase para mostrar

Abrir la instancia del equipo en Supabase Studio y entrar a **Table Editor > public**. Tener listas las tablas `shops`, `profiles`, `associations`, `entrepreneur_types`, `categories` y `product_types`. En **SQL Editor** se pueden ejecutar las consultas de lectura de `supabase/demo/consultas-profesor.sql` para comprobar cantidades, asignaciones, roles, políticas RLS y bucket de imágenes.

Comprobación con la API pública de esta entrega:

| Recurso público | Filas |
| --- | ---: |
| public_shops | 3 |
| associations | 2 |
| entrepreneur_types | 3 |
| categories | 5 |
| product_types | 5 |
| shop_associations | 3 |

El acceso por correo está habilitado y **Google está deshabilitado en el servidor**. Estas lecturas no comprueban los perfiles privados ni equivalen a verificar todos los puntos de la pauta B01-B13. Para completar esa revisión hacen falta las credenciales de administración y la pauta detallada. El equipo ya tiene herramientas de datos ficticios en `supabase/tools/admin.mjs`; no volver a sembrar ni aplicar migraciones para una demostración si los datos ya están preparados.

La consola necesita el usuario y contraseña de Studio suministrados por el profesor. La clave anon de Android/web no abre ese panel. El acceso administrativo se verificó posteriormente con consultas de lectura: `shops` tiene 6 filas; `profiles`, 10; `associations`, 2; `entrepreneur_types`, 4; `categories`, 5; y `product_types`, 5. Las tiendas ficticias `shop_demo_ana` y `shop_demo_bea` están activas, tienen dueñas activas con rol emprendedora y una asociación asignada cada una. Google continúa deshabilitado y el acceso por correo está habilitado. No se modificaron datos ni la configuración del servidor durante esta comprobación. Las credenciales no se guardan en este documento ni en Git.

## Activar Google cuando esté disponible el acceso

El 4 de noviembre de 2026 se creó el cliente OAuth **ConectaSur Supabase** en el proyecto Google Cloud `conectasur`, con origen `https://conectasur-dev.web.app` y callback `https://supabase-surcode.codepulse.cl/auth/v1/callback`. La cuenta de Fabián está agregada como usuario de prueba. El Client Secret quedó cifrado fuera de Git. Se comprobó de nuevo que el servidor devuelve `external.google=false`: la configuración de Google Cloud no habilita por sí sola Google en Supabase. El equipo solo tiene las credenciales de Studio; no se ha identificado acceso a la administración del servidor y la activación queda pendiente.

El administrador debe configurar el proveedor Google de Supabase con el Client ID y Client Secret del proyecto del equipo. En Google Cloud, registrar la URL de callback de Supabase, normalmente `https://<instancia>/auth/v1/callback`. En Supabase, permitir las URL de retorno de la web y el enlace Android `conectasur://auth/callback` con su parámetro `client_state` generado por cada intento. Usar una regla de redirección acotada a ese callback, no una regla que permita cualquier destino.

El retorno se completa con PKCE; un enlace cancelado, vencido o que no corresponda al intento no crea una sesión. Google OAuth real se prueba después de configurar el proveedor y sus destinos permitidos. No se guardan Client Secret, contraseñas ni claves administrativas en el cliente ni en Git.

Referencias de configuración: [Google en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [flujo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Cierre de los pendientes Android sin Google

Se corrigió A08 para que desactivar huella cierre la sesión y vuelva a pedir correo y contraseña. A16/A17 ahora ofrecen selección de tipos configurados en Supabase y sectores de Puerto Montt, con reintento de carga y conservación de valores históricos. Detalles y límites: [ajustes Android](pendientes-android.md).

Verificación local del 4 de noviembre: 62 pruebas unitarias Android aprobadas, APK conectado compilado, pruebas instrumentadas compiladas y Android Lint aprobado. Las pruebas instrumentadas no se ejecutaron: no había teléfono conectado ni emulador configurado. No se da por demostrada la huella real, la persistencia real del logo ni el ingreso Google de extremo a extremo. Los cambios recientes de `main` se integraron sin conflictos.

## Respaldo Firebase para el profesor

Commit histórico completo: `f87cc6acadb49a1b8b237b49d1ad7d447f86a363`, **Firebase: reglas, pruebas, datos ficticios y repositorios**.

- [Reglas Firestore del commit](https://github.com/fabi1092/ConectaSur/blob/f87cc6acadb49a1b8b237b49d1ad7d447f86a363/firebase/firestore.rules).
- [Pruebas de reglas](https://github.com/fabi1092/ConectaSur/blob/f87cc6acadb49a1b8b237b49d1ad7d447f86a363/firebase/test/rules.test.js).
- [Modelo de datos histórico](https://github.com/fabi1092/ConectaSur/blob/f87cc6acadb49a1b8b237b49d1ad7d447f86a363/docs/felipe/modelo-datos.md).

Para mostrar las reglas sin cambiar de rama:

```sh
git show f87cc6a:firebase/firestore.rules
git show f87cc6a:firebase/test/rules.test.js
```

En ese diseño, `users/{uid}` guarda rol y activación; las listas administrativas son públicas para lectura; el catálogo privado y las ventas pertenecen a la dueña; `publicProducts` valida una proyección sin stock privado. La prueba vigente de Supabase se basa en SQL/RLS. El respaldo histórico permite explicar el trabajo anterior y no demuestra el estado actual de un proyecto remoto Firebase.
