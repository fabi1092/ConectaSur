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

La consola necesita el usuario y contraseña de Studio suministrados por el profesor. La clave anon de Android/web no abre ese panel. En este equipo no se encontró la configuración administrativa cifrada que utiliza el lanzador `supabase/tools/local-access.ps1`.

## Activar Google cuando esté disponible el acceso

El administrador debe configurar el proveedor Google de Supabase con el Client ID y Client Secret del proyecto del equipo. En Google Cloud, registrar la URL de callback de Supabase, normalmente `https://<instancia>/auth/v1/callback`. En Supabase, permitir las URL de retorno de la web y el enlace Android `conectasur://auth/callback` con su parámetro `client_state` generado por cada intento. Usar una regla de redirección acotada a ese callback, no una regla que permita cualquier destino.

El retorno se completa con PKCE; un enlace cancelado, vencido o que no corresponda al intento no crea una sesión. Google OAuth real se prueba después de configurar el proveedor y sus destinos permitidos. No se guardan Client Secret, contraseñas ni claves administrativas en el cliente ni en Git.

Referencias de configuración: [Google en Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [flujo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

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
