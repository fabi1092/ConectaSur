# Entrega 4 — Acceso, administración y tienda

**SurCode / ConectaSur · 4 de noviembre de 2026 · EVA 3 (35 %).**

## 1. Lo realizado

### Web: administración, acceso y ficha pública
- **Acceso único por perfil (`#ingresar`):** el servidor valida el perfil activo en `profiles` y dirige automáticamente al panel administrativo (`admin`), a `Mi tienda` (`emprendedora`) o a `Mi cuenta` (`comprador`). El visitante recorre la portada, el catálogo y las fichas de tienda (`#tienda/ID`) sin iniciar sesión (**W01, W02, W25, W26, W29–W32**). También se programó la opción «Continuar con Google» para compradores (`loginWithGoogle` en `web/supabase-data.js`), condicionada a activar el proveedor en el servidor (ver sección 2).
- **Gestión de emprendedoras (**W04–W09, WA4, WA5**):** creación de cuenta y tienda con sesión secundaria aislada (sin cerrar la sesión del administrador), pantalla de entrega con opción de mostrar y copiar credenciales al portapapeles, edición de datos de tienda con persistencia al recargar, desactivación con confirmación explícita y bloqueo inmediato de ingreso en web y Android para cuentas desactivadas.
- **Gestión de asociaciones (**W10–W19, WA4, WA6**):** alta y edición de asociaciones con nombre, descripción, sector, contacto y logo en Storage (`association-images`), asignación y retiro de tiendas integrantes, y desactivación con confirmación.
- **Catálogos y cuentas administradoras (**W20–W24**):** creación y edición de tipos de emprendimiento, categorías y tipos de productos; gestión de otras cuentas administradoras (alta, edición de nombre, activación y desactivación con protección contra baja propia y del último administrador activo); búsqueda por texto y filtros de estado en los listados administrativos (emprendedoras, administradores, asociaciones, tipos de emprendimiento, categorías y tipos de producto).
- **Recuperación de contraseña (**W27**):** solicitud de correo de recuperación y restablecimiento de contraseña pegando el enlace o código recibido, cerrando sesiones previas si corresponde.
- **Ficha de tienda y edición web (**W33–W40, WA1, WA2**):** visualización pública de nombre, logo, descripción, tipo de emprendimiento, sector y contacto tal como los guarda la emprendedora; edición de ficha y logo también desde la web; interfaz en español de Chile, diseño adaptable a teléfono sin desbordes y acceso exclusivo mediante capa de datos (`web/supabase-data.js`).

### App Android: acceso de emprendedora y comprador, huella y ficha de tienda
- **Separación de modos y ausencia de panel administrativo (**W03, A01**):** la pantalla principal distingue la exploración del catálogo (`Ver productos`), el acceso de emprendedora (`Mi tienda`) y el acceso de comprador con Google (`Continuar con Google (Comprador)`, con estado de sesión y `Cerrar sesión de comprador`; condicionado a activar el proveedor, ver sección 2). No existe panel de administración de plataforma en la aplicación móvil.
- **Acceso de emprendedora y biometría (**A02–A08, A11, A13, AA2**):** inicio de sesión con las credenciales creadas en la web, mensajes claros ante credenciales inválidas o fallos de red, rechazo de cuentas desactivadas y cierre de sesión. Tras el primer ingreso, la emprendedora puede activar el desbloqueo con huella mediante `BiometricPrompt` y `AndroidKeyStore` (sin almacenar datos biométricos en la aplicación), reingresar con huella y desactivarla para volver al ingreso con contraseña.
- **Edición y persistencia de la ficha de tienda y asociaciones asignadas (**A14–A21, AA1, AA4**):** visualización en solo lectura de las asociaciones a las que el administrador asignó la tienda (`listShopAssociations`), edición de nombre, descripción, tipo de emprendimiento, sector de Puerto Montt, datos de contacto y subida de logo comprimido a JPEG (`LogoEncoder.kt`), conservando texto e imagen al cerrar y reabrir la aplicación.
- **Usabilidad, idioma y arquitectura (**A22–A26, B16**):** español de Chile, acceso a datos por repositorios (`domain/Repositories.kt` y `data/SupabaseRepositories.kt`), botones con iconos acompañados de texto, altura táctil mínima de 48 dp y respeto al tamaño de fuente del sistema.

### Backend, seguridad y datos de prueba
- **Reglas, permisos y modelo (**B01–B13, BA1**):** control de acceso por fila (RLS) y funciones RPC con `security definer` en PostgreSQL y Storage (`supabase/migrations/001_conectasur.sql` a `006_cuentas_administradoras.sql`), asegurando que ninguna emprendedora modifique tiendas o archivos ajenos y que solo un administrador activo gestione cuentas, asociaciones y catálogos. El modelo de datos, sus decisiones y sus índices están documentados en [docs/felipe/modelo-datos.md](../felipe/modelo-datos.md), y el modelo original de Firestore junto con sus reglas se conserva en [docs/historico/modelo-firestore.md](../historico/modelo-firestore.md).
- **Higiene de repositorio y ejecución (**B14, B15, B17, B18**):** credenciales y claves privadas excluidas de Git, pasos de ejecución documentados en [README.md](../../README.md), contribuciones de los integrantes en el historial y etiqueta `entrega-4` sobre el commit de entrega.

---

## 2. Resumen de requisitos cubiertos y pendientes

| Bloque | Cubiertos | Pendientes o condicionados |
| --- | --- | --- |
| **1. Web (W01–W40, WA1–WA6)** | W01–W27, W29–W40; adicionales WA1, WA2, WA4, WA5, WA6 | **W28** (botón y flujo OAuth con Google programados en la web, pero el proveedor Google está desactivado en Supabase Auth: `/auth/v1/settings` responde `"google": false` el 3 de noviembre; la web muestra un aviso claro en vez de iniciar sesión); **WA3** (registro de auditoría activo en tabla `admin_actions` por triggers, sin pantalla de consulta en el panel). |
| **2. App Android (A01–A26, AA1–AA4)** | A01–A08, A11, A13–A26; adicionales AA1, AA2, AA4 | **A09, A10, A12** (acceso de comprador solo con Google y su cierre de sesión programados en `MainActivity`, con retorno `conectasur://auth/callback`; no funcionan de punta a punta mientras el proveedor Google siga desactivado en el servidor y no se autorice ese retorno); **AA3** (demostración de huella en teléfono físico durante la sesión). |
| **3. Backend y repositorio (B01–B20, BA1)** | B01–B19, BA1 (sobre la instancia Supabase del grupo y con respaldo documental de Firebase en `docs/historico/`) | **B20** (la mayoría de las integraciones se realizaron sobre `main` por acuerdo del grupo, sin enlazar cada tarea mediante Pull Requests separados a issues). |
| **4. Problemáticas (P01a–P09a)** | **P01a** (guía de luz y encuadre al subir logo), **P04a** (ficha web comprensible desde teléfono sin instalar la app), **P05a** (vista previa del logo y confirmación antes de publicar cambios) | Pruebas presenciales con usuarias en teléfonos físicos (**P08a**). |

---

## 3. Reparto de trabajo

| Integrante | Responsabilidad y aportes registrados |
| --- | --- |
| **Benjamín Tampier** | Base Android y accesibilidad, migración e integración con Supabase, panel web administrativo (asociaciones con logo, tipos de emprendimiento, cuentas administradoras, buscadores, edición de catálogos), acceso de compradores (correo y flujo Google en web y móvil), visualización de asociaciones en Android, recuperación de contraseña, persistencia de sesión, pruebas automatizadas y documentación. |
| **Fabián Barroso** | Flujo Android de acceso de emprendedora (`StoreActivity`), bloqueo opcional con huella (`BiometricStoreLock`), edición de ficha y logo de tienda (`LogoEncoder`) y documentación en [docs/fabian/acceso-tienda.md](../fabian/acceso-tienda.md). |
| **Felipe Gallardo** | Diseño del modelo de datos, reglas de seguridad e índices tanto en la etapa inicial de Firestore ([docs/historico/modelo-firestore.md](../historico/modelo-firestore.md)) como en la documentación vigente ([docs/felipe/modelo-datos.md](../felipe/modelo-datos.md)). |
| **Kisho** | Estructura inicial del panel web administrativo (`web/src/main.js`), gestión base de emprendedoras, asociaciones, integrantes y listas de catálogo. |
| **Dan Velásquez** | Módulo de productos y catálogo de emprendedora conectado con la tienda. |
| **Alonso Núñez** | Módulo de ventas e inventario vinculado a la operación de la tienda. |

---

## 4. Documentación detallada de la Entrega 4

- [Ficha pública de tienda](ficha-publica.md)
- [Acceso de emprendedoras y administración](acceso-emprendedoras.md)
- [Acceso de compradores](acceso-compradores.md)
- [Recuperación de contraseña](recuperacion-contrasena.md)
- [Sesión persistente en web y Android](sesion-persistente.md)
- [Logos de asociaciones](logos-asociaciones.md)
- [Tipos de emprendimiento](tipos-emprendimiento.md)
- [Cuentas administradoras](cuentas-administradoras.md)
- [Dashboard y navegación de tienda](dashboard-web.md)
- [Productos desde la web](productos-web.md)
- [Rediseño web](redisenio-web.md)
