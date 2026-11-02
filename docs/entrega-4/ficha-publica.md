# Bloque 1: ficha pública de tienda

Revisión: miércoles 4 de noviembre de 2026. Alcance de este bloque: portada pública y lectura de la ficha guardada por la emprendedora. No incorpora todavía acceso web de emprendedoras/compradores ni recuperación de contraseña.

## Recorrido para demostrar

1. Abrir https://conectasur-dev.web.app sin iniciar sesión. Se muestran las tiendas disponibles. Buscar por nombre, tipo o sector.
2. Abrir Ver tienda. La ficha muestra nombre, logo/foto cuando existe, descripción, tipo, sector y contacto.
3. Desde Android, iniciar sesión en Mi tienda con la cuenta ficticia correspondiente, modificar su descripción y pulsar Guardar cambios. Recargar la ficha web y mostrar el mismo texto.
4. Copiar la dirección de la ficha (#tienda/ID) y abrirla sin sesión en otro navegador o celular.
5. Elegir Ingresar desde la cabecera y usar una cuenta administradora para entrar al panel. Ver tiendas públicas permite volver sin mezclar controles administrativos con la ficha.

## Trazabilidad al checklist del profesor

| Ítem | Comportamiento implementado |
| --- | --- |
| W32 | Portada y ficha accesibles sin cuenta. |
| W33 | Nombre de la tienda leído del mismo registro que actualiza Android. |
| W34 | Logo/foto desde Storage; inicial del nombre si falta o no se puede cargar. |
| W35–W38 | Descripción, tipo de emprendimiento, sector y contacto. |
| W39 | Textos en español de Chile y documento HTML es-CL. |
| W40 | Las pantallas reciben la capa de datos; no consultan el SDK directamente. |

El acceso a datos usa Supabase según la migración acordada por el grupo. El checklist menciona Firestore; aceptar esta equivalencia debe aclararse con el profesor y no se da por aprobado en este informe.

## Datos y privacidad

La lista usa listPublicShops() y la ficha getShop(), en web/supabase-data.js. Ambas consultan public_shops: la vista filtra tiendas y perfiles activos y expone solo la proyección pública. La pantalla no consulta profiles, productos privados ni ventas, y no requiere una sesión administrativa.

Los datos recibidos se escapan antes de mostrarse. Solo se aceptan imágenes HTTPS; los contactos ejecutables no generan enlaces. Se muestran estados explícitos si faltan datos, la tienda no existe, fue desactivada o falla la conexión. La ficha completa no recorta la descripción ni los datos de contacto.

## Verificación

security/public-shops-check.mjs usa una cuenta ficticia temporal y una tienda propia. Guarda los seis campos por la API de la dueña y comprueba su lectura anónima y su representación en Chromium. Incluye enlace directo, recarga, edición persistida, desactivación, búsqueda, error/reintento, contenido hostil y regresión del acceso administrativo.

El recorrido usa navegador de escritorio y emulación móvil de 390 px; también revisa ausencia de desbordamiento a 320 px con texto al 200 %. Las capturas usan una tienda ficticia temporal y un logo sintético de prueba, no un emprendimiento real.

Evidencia: security/reports/public-shops/verification.json y capturas en la misma carpeta. Para repetir: iniciar Vite en web con puerto 5174, proporcionar CONECTASUR_PRIVATE solo en memoria y ejecutar node security/public-shops-check.mjs con Playwright/Chromium disponible (PLAYWRIGHT_MODULE permite indicar su instalación). PUBLIC_SHOPS_URL permite probar otra URL.

La prueba actualiza la tienda mediante la misma API que Android. No equivale a operar Android en este recorrido: la demostración conjunta app → web del paso 3 debe ensayarse con la versión instalada. Tampoco reemplaza una prueba física con personas mayores. Los demás bloques del checklist siguen pendientes.
