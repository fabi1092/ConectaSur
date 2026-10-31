# Hito 2: pantallas y accesibilidad

Responsable: Benjamín Tampier. Rama de trabajo: `feat/benjamin/hito-2-pantallas`.

## Qué cambia respecto de la base y el prototipo

- Inicio con acciones concretas, sin elegir un rol ni pedir huella al abrir.
- Navegación con Inicio, Productos, Ayuda y Volver; mantiene la búsqueda y el producto al recrear la actividad.
- Texto breve: Mi tienda y Tu tienda, más cerca, para evitar palabras largas en los tamaños grandes.
- Con letra del sistema y de la app combinadas muy grandes, la barra de tres destinos cambia a un menú de opciones amplias y desplazables.
- Texto normal, grande o muy grande, respetando además el tamaño del sistema. Botones de al menos 56 dp y opción de 72 dp. Los contenedores permiten desplazarse.
- Mayor contraste y estado seleccionado identificable por borde y por información para TalkBack.
- Lectura iniciada exclusivamente al pulsar Escuchar, con Detener y velocidad más lenta. Dice pesos chilenos y utiliza una voz española instalada sin necesidad de IA. Si falta una voz local, informa cómo obtenerla sin descargarla automáticamente.
- Catálogo de tres productos ficticios con fotografías de la visita. Búsqueda sin distinguir tildes o mayúsculas, con cantidad de resultados y recuperación cuando no hay coincidencias.
- Flores tejidas clasificadas como Artesanías. No se confunde el material o el motivo floral con una planta viva.
- La vista pública del emprendimiento no muestra controles de modificar logo ni de ventas.
- El precio oculto se proyecta como Consultar precio, también al escuchar o compartir información.
- Logo elegible con el selector del sistema, sin permiso general de almacenamiento. En esta demostración se guarda una referencia local y no se publica en la nube.
- Compartir abre el selector de aplicaciones con texto claramente marcado como ejemplo. No inventa un enlace público que todavía no existe.
- Ayuda diferencia lectura por voz, TalkBack y dictado del teclado. No activa servicios de accesibilidad ni solicita huella automáticamente.

## Pantallas XML para Palette

`activity_main.xml` es el contenedor de navegación. Las pantallas están en `res/layout`: `screen_home`, `screen_catalog`, `item_product`, `screen_detail`, `screen_store`, `screen_settings`, `screen_help` y `screen_sales`.

Todas pueden abrirse con Design o Split. El layout del contenedor incluye la pantalla de inicio para mostrarla en el editor; Kotlin carga la pantalla correspondiente durante la ejecución.

## Integración del equipo

| Integrante | Punto de conexión | Pendiente |
|---|---|---|
| Fabián | Destino store y pantalla screen_store | Reemplazar la demostración por la tienda de la cuenta autenticada y su edición; almacenar el logo por tienda. |
| Dan | CatalogRepository y destinos catalog/detail | Conectar productos reales, publicación, variantes y edición. La interfaz emite StateFlow de PublicProduct. |
| Alonso | Destino sales y screen_sales | Registrar ventas, movimientos e historial; actualizar cantidades de forma coherente con Firebase. Esta pantalla todavía es informativa. |
| Felipe | Implementación de CatalogRepository | Sustituir DemoCatalogRepository por la capa Firebase y aplicar permisos reales por perfil. |
| Kisho | Panel web | Compartir los nombres y tipos de campos acordados con la capa de datos. |

Propuesta de contenido público: id, shopId, name, description, category, priceClp opcional, onRequest y referencia de foto. Los precios son enteros en pesos chilenos. Los datos de muestra utilizan stock por unidades, pieza única o por encargo. Revisar estos contratos con el levantamiento antes de tratarlos como el modelo definitivo.

La proyección pública de los ejemplos no sustituye reglas de seguridad. La capa Firebase debe impedir que un cliente descargue datos privados; ocultarlos en una pantalla no protege el documento original. No usar el shopId del cliente para autorizar escrituras sin validar su propiedad.

## Referencias de diseño y accesibilidad

Se toman patrones, sin copiar las interfaces ni depender de estas aplicaciones:

- [Acceso asistido de Apple](https://support.apple.com/es-lamr/guide/assistive-access-iphone/dev473e94873/ios): funciones definidas, texto e iconos grandes. Aplicación: pocos destinos y nombres explícitos.
- [Ajuste de letra de Samsung](https://www.samsung.com/es/support/mobile-devices/como-ajustar-el-tamano-y-el-estilo-de-la-letra-de-tu-smartphone-galaxy/): personalización del texto. Aplicación: preferencias locales y respeto por el tamaño del sistema.
- [Accesibilidad de Mercado Libre](https://www.mercadolibre.cl/accesibilidad): compatibilidad con tecnologías de asistencia. Aplicación: controles nativos, nombres accesibles y estados que no dependen solo del color.
- [Accesibilidad de Android Views](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views): objetivos táctiles de al menos 48 dp. Aquí se parte de 56 dp.

Estas decisiones deben probarse con las emprendedoras; las referencias no acreditan por sí solas que el diseño sea intuitivo.

## Límites

No se presenta como terminada la venta, el acceso con cuenta, la subida de productos o el vínculo real con ferias. No se ha acreditado todavía la usabilidad con TalkBack en un teléfono físico ni la lectura con una voz chilena instalada. El hito 3 corresponde a las pruebas de seguridad e informe.

## Verificación ejecutada

Fecha: 31 de octubre de 2026.

- Compilación de APK de depuración: correcta.
- Pruebas unitarias: 8 aprobadas; precio oculto, moneda CLP, búsqueda y publicación según disponibilidad.
- Pruebas instrumentadas: 6 aprobadas en emulador Pixel 7 / Android 16 API 36. Incluyen inicio, búsqueda, detalle, restauración de ruta y consulta, preferencias persistentes, acceso a ayuda y separación de controles de la tienda pública.
- Android Lint: 0 errores y 14 advertencias. Se refieren a versiones más recientes, uso de SwitchCompat, reglas de extracción de datos y recomendaciones de extensiones KTX. No se han silenciado; la revisión de almacenamiento y seguridad continúa en el hito 3.
- Revisión visual: tamaño habitual y pantalla de 320 dp con letra del sistema al 200 % más el ajuste Muy grande. Se comprobó el menú de opciones amplias y desplazables.
- Selector de logo: elección real de una imagen de prueba desde el selector de documentos de Android; se mostró en la tienda y se conservó al reiniciar la app. El muestreo de la imagen se inicia en 1 y limita la dimensión decodificada para evitar cargar el original completo.
- Tras ajustar el muestreo del logo, se repitieron compilación y Lint y se verificó manualmente la elección y persistencia de la imagen.

Las pruebas no equivalen a una validación con personas mayores o con TalkBack en un teléfono físico. La disponibilidad y pronunciación de una voz española o chilena deben comprobarse en los dispositivos de la visita.
