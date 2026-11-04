# Entrega 4 — Acceso, administración y tienda

**SurCode / ConectaSur · 4 de noviembre de 2026 · EVA 3 (35 %).**

## 1. Lo realizado

### Web: administración, acceso y ficha pública
- **Acceso único por perfil (`#ingresar`):** el servidor valida el perfil activo en `profiles` y dirige automáticamente al panel administrativo (`admin`), a `Mi tienda` (`emprendedora`) o a `Mi cuenta` (`comprador`). El visitante recorre la portada, el catálogo y las fichas de tienda (`#tienda/ID`) sin iniciar sesión (**W01, W02, W25, W26, W29–W32**). También se programó la opción «Continuar con Google» para compradores (`loginWithGoogle` en `web/supabase-data.js`), condicionada a activar el proveedor en el servidor (ver sección 2).
- **Gestión de emprendedoras (**W04–W09, WA4, WA5**):** creación de cuenta y tienda con sesión secundaria aislada (sin cerrar la sesión del administrador), pantalla de entrega con opción de mostrar y copiar credenciales al portapapeles, edición de cuenta y tienda, desactivación con confirmación y bloqueo de ingreso para cuentas desactivadas. **W06/W07:** la migración 007 permite editar únicamente el nombre de la persona con administrador activo; conserva acceso, rol, estado y tienda, detecta conflictos y admite reintentos. Guardado y recarga comprobados contra Supabase desde la web pública con fixtures propios. Ver [contrato y evidencia](contrato-cuenta-emprendedora.md).
- **Gestión de asociaciones (**W10–W19, WA4, WA6**):** alta y edición de asociaciones con nombre, descripción, sector, contacto y logo en Storage (`association-images`), asignación y retiro de tiendas integrantes, y desactivación con confirmación.
- **Catálogos y cuentas administradoras (**W20–W24**):** creación y edición de tipos de emprendimiento, categorías y tipos de productos; gestión de otras cuentas administradoras (alta, edición de nombre, activación y desactivación con protección contra baja propia y del último administrador activo); búsqueda por texto y filtros de estado en los listados administrativos (emprendedoras, administradores, asociaciones, tipos de emprendimiento, categorías y tipos de producto).
- **Recuperación de contraseña (**W27, validación parcial**):** solicitud de recuperación y restablecimiento pegando el enlace recibido, con pruebas reales del desafío y cambio de contraseña usando cuentas temporales. Falta comprobar la llegada a un buzón real; la redirección automática conserva su límite externo. Ver [evidencia y límites](recuperacion-contrasena.md).
- **Ficha de tienda y edición web (**W33–W40, WA1, WA2**):** visualización pública de nombre, logo, descripción, tipo de emprendimiento, sector y contacto tal como los guarda la emprendedora; edición de ficha y logo también desde la web; interfaz en español de Chile, diseño adaptable a teléfono sin desbordes y acceso exclusivo mediante capa de datos (`web/supabase-data.js`).

### App Android: acceso de emprendedora y comprador, huella y ficha de tienda
- **Separación de modos y ausencia de panel administrativo (**W03, A01**):** la portada permite explorar sin cuenta y ofrece un formulario común **Ingresar**. El perfil activo del servidor abre **Mi cuenta** de comprador, **Mi tienda** de emprendedora o el enlace externo al panel web administrativo. Todos los perfiles pueden cerrar sesión. No existe panel de administración de plataforma en Android. Actualización del 4 de noviembre por petición del usuario: correo y contraseña también para comprador, lo que cambia A10/RN-07; [decisión, pruebas y límites](acceso-unificado-android.md).
- **Acceso de emprendedora y biometría (**A02–A08, A11, A13, AA2**):** inicio de sesión con las credenciales creadas en la web, mensajes claros ante credenciales inválidas o fallos de red, rechazo de cuentas desactivadas y cierre de sesión. Tras el primer ingreso, la emprendedora puede activar el desbloqueo con huella mediante `BiometricPrompt` y `AndroidKeyStore` (sin almacenar datos biométricos en la aplicación), reingresar con huella y desactivarla para volver al ingreso con contraseña.
- **Edición y persistencia de la ficha de tienda y asociaciones asignadas (**A14–A21, AA1, AA4**):** visualización en solo lectura de las asociaciones a las que el administrador asignó la tienda (`listShopAssociations`), edición de nombre, descripción, tipo de emprendimiento, sector de Puerto Montt, datos de contacto y subida de logo comprimido a JPEG (`LogoEncoder.kt`), conservando texto e imagen al cerrar y reabrir la aplicación.
- **Usabilidad, idioma y arquitectura (**A22–A26, B16**):** español de Chile, acceso a datos por repositorios (`domain/Repositories.kt` y `data/SupabaseRepositories.kt`), botones con iconos acompañados de texto, altura táctil mínima de 48 dp y respeto al tamaño de fuente del sistema.

### Backend, seguridad y datos de prueba
- **Reglas, permisos y modelo (**B01–B13, BA1**):** políticas RLS, funciones RPC y políticas de Storage versionadas en migraciones 001–007. La [demostración preparada](backend-demostracion.md) incorpora metadatos reales, justificación de índices, datos ficticios y pruebas de operaciones por perfil; el [modelo vigente](../felipe/modelo-datos.md) corresponde a Supabase. **Límites:** falta presentar ese recorrido al docente, no está verificada una producción independiente (B12) y la pauta conserva ítems Firebase cuya adaptación debe explicarse. El [diseño Firestore histórico](../historico/modelo-firestore.md) y `f87cc6a` no equivalen a reglas Firebase activas.
- **Higiene de repositorio y ejecución (**B14, B15, B17, B18**):** configuraciones privadas excluidas de Git, pasos de ejecución en [README.md](../../README.md) y contribuciones de integrantes en el historial. La etiqueta `entrega-4` existe; deberá identificar el cierre revisado de ambas partes, sin confundir su publicación con el despliegue de Hosting.

---

## 2. Resumen de requisitos cubiertos y pendientes

| Bloque | Cubiertos | Pendientes o condicionados |
| --- | --- | --- |
| **1. Web (W01–W40, WA1–WA6)** | W01–W26 y W29–W40 según las pruebas de cada hito; W06/W07 guardan y persisten en la web pública. Adicionales WA1, WA2, WA4, WA5, WA6 | **W27:** confirmar recepción en buzón real; alternativa de pegar enlace probada. **W28:** retorno PKCE integrado; proveedor deshabilitado, pendiente ingreso real. **WA3:** auditoría en tabla, sin pantalla de consulta; adicional. |
| **2. App Android (A01–A26, AA1–AA4)** | Acceso, tienda, selectores y asociaciones implementados. 62 pruebas unitarias, APK y Lint aprobados. La cancelación durante asociaciones ya está corregida y probada. AA1/AA2/AA4 implementados | **A04–A08, A13, A19–A21, A26:** recorrido práctico pendiente; no equivale a falta de código. **A09/A10/A12:** Google real pendiente del servidor. **AA3:** demostración física adicional. |
| **3. Backend y repositorio (B01–B20, BA1)** | Modelo, políticas, pruebas, justificación de índices, consultas, README, arquitectura e informe preparados; cierre actual trazado en [issue #8](https://github.com/fabi1092/ConectaSur/issues/8) y W06/W07 en [#4](https://github.com/fabi1092/ConectaSur/issues/4) | **B01–B13:** presentar las operaciones y adaptación Supabase; **B12:** producción independiente sin verificar. **B17/B20:** usar la referencia y PR del cierre comprobado; no se inventan revisiones ni vínculos históricos. |
| **4. Problemáticas (P01a–P09a)** | **P01a** (guía de luz y encuadre al subir logo), **P04a** (ficha web comprensible desde teléfono sin instalar la app), **P05a** (vista previa del logo y confirmación antes de publicar cambios) | Pruebas presenciales con usuarias en teléfonos físicos (**P08a**). |

---

## 3. Reparto de trabajo

| Integrante | Responsabilidad y aportes registrados |
| --- | --- |
| **Benjamín Tampier** | Base Android y accesibilidad, migración e integración con Supabase, panel web administrativo (asociaciones con logo, tipos de emprendimiento, cuentas administradoras, buscadores, edición de catálogos), acceso de compradores (correo y flujo Google en web y móvil), visualización de asociaciones en Android, recuperación de contraseña, persistencia de sesión, pruebas automatizadas y documentación. |
| **Fabián Barroso** | Acceso y edición de tienda Android, huella, logo, selectores de tipo/sector, comprador y cierre de sesión, retorno PKCE Android/web y asociación con reintento/cancelación. Pruebas y documentación de la [Parte 2](../fabian/demo-parte-2.md). |
| **Felipe Gallardo** | Diseño del modelo de datos, reglas de seguridad e índices tanto en la etapa inicial de Firestore ([docs/historico/modelo-firestore.md](../historico/modelo-firestore.md)) como en la documentación vigente ([docs/felipe/modelo-datos.md](../felipe/modelo-datos.md)). |
| **Kisho** | Estructura inicial del panel web administrativo (`web/src/main.js`), gestión base de emprendedoras, asociaciones, integrantes y listas de catálogo. |
| **Dan Velásquez** | Módulo de productos y catálogo de emprendedora conectado con la tienda. |
| **Alonso Núñez** | Módulo de ventas e inventario vinculado a la operación de la tienda. |

---

## 4. Documentación detallada de la Entrega 4

- [Estado y orden del cierre de integración](cierre-integracion.md)
- [Edición de cuenta implementada y verificada](contrato-cuenta-emprendedora.md)
- [Demostración de backend, índices y entornos](backend-demostracion.md)
- [Recorrido que Benjamín verificará manualmente](verificacion-manual.md)
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

## 5. Evidencia del cierre automatizado

- Migración 007 aplicada: W06/W07 guardan y persisten. Siete pruebas SQL nuevas y siete comprobaciones en la web pública; `fixturesCleaned=true`.
- 42 pruebas reales de permisos, productos, ventas y Storage aprobadas. La ampliación inicial encontró un 502 de lectura; el reintento limitado a GET se documentó y la repetición completa aprobó.
- CI incorpora las 33 pruebas web, incluidas las 14 de Google/PKCE del compañero; las pruebas SQL se ejecutan en PostgreSQL desechable. La ejecución local PGlite aprobó 33 y omitió una prueba de concurrencia que corresponde a PostgreSQL real en CI.
- Hosting actualizado y nueve comprobaciones públicas aprobadas: archivos compilados, ausencia de contraseñas en el bundle, portada/búsqueda, diseño móvil, Google no disponible sin sesión ficticia, ingreso y salida de administrador, emprendedora y comprador, y sesión/navegación de tienda.
- [PR del cierre #9](https://github.com/fabi1092/ConectaSur/pull/9), enlazado a [#4](https://github.com/fabi1092/ConectaSur/issues/4) y [#8](https://github.com/fabi1092/ConectaSur/issues/8). La referencia de cierre es `entrega-4-cierre`; la etiqueta anterior conserva su revisión histórica. Esto no acredita revisión humana de otro integrante ni regulariza retroactivamente todos los PR anteriores.

Google real, recepción del correo, recorrido Android y producción independiente conservan los límites indicados. La guía manual se entrega sin casillas marcadas: no se registran esas pruebas como realizadas por generar la hoja.
