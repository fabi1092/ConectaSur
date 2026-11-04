# Entrega 4 — Acceso, administración y tienda

**SurCode / ConectaSur · 4 de noviembre de 2026 · EVA 3 (35 %).**

## 1. Lo realizado

### Web: administración, acceso y ficha pública
- **Acceso único por perfil (`#ingresar`):** el servidor valida el perfil activo en `profiles` y dirige automáticamente al panel administrativo (`admin`), a `Mi tienda` (`emprendedora`) o a `Mi cuenta` (`comprador`). El visitante recorre la portada, el catálogo y las fichas de tienda (`#tienda/ID`) sin iniciar sesión (**W01, W02, W25, W26, W29–W32**). También se programó la opción «Continuar con Google» para compradores (`loginWithGoogle` en `web/supabase-data.js`), condicionada a activar el proveedor en el servidor (ver sección 2).
- **Gestión de emprendedoras (**W04, W05, W08, W09, WA4, WA5**):** creación de cuenta y tienda con sesión secundaria aislada (sin cerrar la sesión del administrador), pantalla de entrega con opción de mostrar y copiar credenciales al portapapeles, edición de datos de tienda, desactivación con confirmación y bloqueo de ingreso para cuentas desactivadas. **W06/W07:** la pantalla Editar cuenta y la lectura del nombre de la persona están preparadas; el guardado y su persistencia real esperan la función de backend del compañero. Editar la tienda no acredita por sí solo editar la cuenta. Ver el [contrato de integración](contrato-cuenta-emprendedora.md).
- **Gestión de asociaciones (**W10–W19, WA4, WA6**):** alta y edición de asociaciones con nombre, descripción, sector, contacto y logo en Storage (`association-images`), asignación y retiro de tiendas integrantes, y desactivación con confirmación.
- **Catálogos y cuentas administradoras (**W20–W24**):** creación y edición de tipos de emprendimiento, categorías y tipos de productos; gestión de otras cuentas administradoras (alta, edición de nombre, activación y desactivación con protección contra baja propia y del último administrador activo); búsqueda por texto y filtros de estado en los listados administrativos (emprendedoras, administradores, asociaciones, tipos de emprendimiento, categorías y tipos de producto).
- **Recuperación de contraseña (**W27, validación parcial**):** solicitud de recuperación y restablecimiento pegando el enlace recibido, con pruebas reales del desafío y cambio de contraseña usando cuentas temporales. Falta comprobar la llegada a un buzón real; la redirección automática conserva su límite externo. Ver [evidencia y límites](recuperacion-contrasena.md).
- **Ficha de tienda y edición web (**W33–W40, WA1, WA2**):** visualización pública de nombre, logo, descripción, tipo de emprendimiento, sector y contacto tal como los guarda la emprendedora; edición de ficha y logo también desde la web; interfaz en español de Chile, diseño adaptable a teléfono sin desbordes y acceso exclusivo mediante capa de datos (`web/supabase-data.js`).

### App Android: acceso de emprendedora y comprador, huella y ficha de tienda
- **Separación de modos y ausencia de panel administrativo (**W03, A01**):** la pantalla principal distingue la exploración del catálogo (`Ver productos`), el acceso de emprendedora (`Mi tienda`) y el acceso de comprador con Google (`Continuar con Google (Comprador)`, con estado de sesión y `Cerrar sesión de comprador`; condicionado a activar el proveedor, ver sección 2). No existe panel de administración de plataforma en la aplicación móvil.
- **Acceso de emprendedora y biometría (**A02–A08, A11, A13, AA2**):** inicio de sesión con las credenciales creadas en la web, mensajes claros ante credenciales inválidas o fallos de red, rechazo de cuentas desactivadas y cierre de sesión. Tras el primer ingreso, la emprendedora puede activar el desbloqueo con huella mediante `BiometricPrompt` y `AndroidKeyStore` (sin almacenar datos biométricos en la aplicación), reingresar con huella y desactivarla para volver al ingreso con contraseña.
- **Edición y persistencia de la ficha de tienda y asociaciones asignadas (**A14–A21, AA1, AA4**):** visualización en solo lectura de las asociaciones a las que el administrador asignó la tienda (`listShopAssociations`), edición de nombre, descripción, tipo de emprendimiento, sector de Puerto Montt, datos de contacto y subida de logo comprimido a JPEG (`LogoEncoder.kt`), conservando texto e imagen al cerrar y reabrir la aplicación.
- **Usabilidad, idioma y arquitectura (**A22–A26, B16**):** español de Chile, acceso a datos por repositorios (`domain/Repositories.kt` y `data/SupabaseRepositories.kt`), botones con iconos acompañados de texto, altura táctil mínima de 48 dp y respeto al tamaño de fuente del sistema.

### Backend, seguridad y datos de prueba
- **Reglas, permisos y modelo (**B01–B13, BA1; demostración a cargo de la Parte 2**):** existen políticas RLS, funciones RPC y políticas de Storage (`supabase/migrations/001_conectasur.sql` a `006_cuentas_administradoras.sql`) con pruebas de aislamiento por perfil. El modelo vigente está en [docs/felipe/modelo-datos.md](../felipe/modelo-datos.md). Antes del cierre, presentar modelo, relaciones, justificación de índices, entorno de desarrollo/datos ficticios y lectura/escritura reales en la consola; explicitar la adaptación de los ítems que todavía nombran Firebase. El diseño original se conserva en [docs/historico/modelo-firestore.md](../historico/modelo-firestore.md) y el commit histórico `f87cc6a`. Este antecedente no equivale a que el backend activo sea Firestore.
- **Higiene de repositorio y ejecución (**B14, B15, B17, B18**):** configuraciones privadas excluidas de Git, pasos de ejecución en [README.md](../../README.md) y contribuciones de integrantes en el historial. La etiqueta `entrega-4` existe; deberá identificar el cierre revisado de ambas partes, sin confundir su publicación con el despliegue de Hosting.

---

## 2. Resumen de requisitos cubiertos y pendientes

| Bloque | Cubiertos | Pendientes o condicionados |
| --- | --- | --- |
| **1. Web (W01–W40, WA1–WA6)** | W01–W05, W08–W26, W29–W40; adicionales WA1, WA2, WA4, WA5, WA6 según las pruebas de cada hito | **W06/W07:** formulario listo, guardado real pendiente de la función del compañero. **W27:** confirmar recepción en buzón; alternativa de pegar enlace probada. **W28:** código Google preparado, pendiente habilitación/validación real y corrección del retorno que permite sustituir una sesión. **WA3:** auditoría en tabla, sin pantalla de consulta. |
| **2. App Android (A01–A26, AA1–AA4)** | Acceso y edición de tienda implementados; comprobar A01–A08, A11 y A13–A26 en el recorrido final. AA1/AA2 implementados | **A09/A10/A12:** Google y cierre programados, pendientes de recorrido real. **AA4:** asociaciones programadas; corregir la cancelación que restaura el estado anterior al cerrar sesión durante la consulta. **A08:** comprobar el comportamiento de contraseña tras desactivar huella. **AA3:** demostración física adicional. |
| **3. Backend y repositorio (B01–B20, BA1)** | Modelo, políticas, pruebas, README, arquitectura, historial e informe disponibles; respaldos históricos en `docs/historico/` | **B01–B13/BA1:** cerrar demostración, justificación de índices, separación de entornos y adaptación Supabase con el compañero. **B17:** etiqueta sobre el cierre revisado. **B20:** faltan tareas como issues enlazadas desde los PR correspondientes; no se acredita ese requisito mediante commits directos. |
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

- [Estado y orden del cierre de integración](cierre-integracion.md)
- [Contrato pendiente de edición de cuenta](contrato-cuenta-emprendedora.md)
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
