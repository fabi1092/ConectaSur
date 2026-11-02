# Publicación web en Firebase Hosting

La web puede alojarse en Firebase Hosting mientras Auth, PostgreSQL y Storage continúan en Supabase. No requiere volver a Firestore ni modificar las cuentas de ConectaSur.

1. Configurar web/supabase-config.js con la URL y anon key del cliente, sin contraseñas.
2. En web, ejecutar npm ci y npm run build con Node 24.12 o superior.
3. Ejecutar firebase login con la cuenta que tiene acceso al proyecto conectasur-dev.
4. Desde la raíz del repositorio, ejecutar firebase deploy --only hosting --project conectasur-dev --config firebase.hosting.json.
5. Comprobar la portada sin sesión, las fichas de tienda y el acceso único #ingresar con cuentas de emprendedora y administrador, incluidos sus cierres de sesión.

firebase.hosting.json publica únicamente web/dist y redirige las rutas a index.html. El comando se limita a hosting: no despliega reglas, funciones, Firestore ni Storage. El dominio definitivo se registra después de una publicación comprobada. La URL anterior de Sites se conserva mientras se verifica la nueva.

## Publicación comprobada

URL principal: https://conectasur-dev.web.app

Publicada el 2 de noviembre de 2026 en Firebase Hosting del proyecto conectasur-dev. Se comprobó HTTP 200, ingreso real de administrador, cuatro secciones administrativas, cierre de sesión y formato móvil. Evidencia: security/reports/hosting-verification.json. Las cuentas y la base de datos continúan en Supabase.

La publicación previa de Sites queda como alternativa existente; la dirección que el equipo comparte ahora es la de web.app.

## Bloque 1 de Entrega 4

La portada publicada muestra tiendas sin pedir una cuenta. Las fichas abren mediante #tienda/ID y consultan public_shops a través de la capa de datos. El panel se abre al usar una cuenta administradora en Ingresar (#ingresar). La publicación inicial de Sites se conserva como versión anterior; no se actualiza automáticamente con Firebase Hosting.

El bloque 2 incorpora un acceso común para ingreso y cierre de sesión: la cuenta de emprendedora abre su tienda y la cuenta administradora abre su panel. La portada no ofrece una sección Administración ni un selector de rol. Ver docs/entrega-4/acceso-emprendedoras.md.

El rediseño incorpora recursos locales de marca y fotos en web/public/assets, galería desde public_products y filtros por categoría. Al publicar, comprobar también que carguen el logo y las fotografías, que el detalle de producto abra su tienda y que los precios ocultos sigan apareciendo como Consultar precio. Referencias y evidencias en docs/entrega-4/redisenio-web.md.
