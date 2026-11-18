# Entrega 6 — Informe de Alonso Núñez (solo Web)

**SurCode / ConectaSur · EVA 4 (50 %) · Noviembre 2026**

---

## 1. Responsabilidad y Alcance

Según la planificación del equipo para la Entrega 6 (criterios **W01–W17** y **A01–A18**), la asignación de Alonso Núñez contempla dos frentes clave:
1. **Datos reales de prueba**:
   - Cargar desde la web 2+ tiendas locales con punto de retiro en mapa.
   - Productos con variantes de distinta fotografía y distinto precio (con stock > 1).
   - Productos en modalidad de pieza única (`UNIQUE`, stock = 1).
   - 1+ asociación comunitaria con integrantes vinculados.
   - 2+ ferias futuras en Puerto Montt y Alerce con coordenadas reales de geolocalización.
2. **Ajustes de contenido web y vitrina**:
   - Revisión y corrección de la vitrina pública (`#productos`, `#tiendas`, `#asociaciones`, `#ferias`).
   - Ficha pública de tienda (`#tienda/<id>`): visualización de la asociación a la que pertenece la emprendedora.
   - Ficha pública de asociación (`#asociacion/<id>`): enlace de fotografías reales de productos en las tarjetas de tiendas integrantes.
   - Modal de producto (`#producto/<id>`): sincronización dinámica del badge de estado y accesibilidad sonora al alternar variantes agotadas, disponibles o a pedido.
   - Ficha pública de feria (`#feria/<id>`): optimización visual del contenedor de portada/afiche.

---

## 2. Lo realizado

### A. Datos reales de prueba (Puerto Montt y Alerce)

Se estructuraron y cargaron datos representativos con pertinencia cultural y geográfica de la zona, disponibles tanto vía script (`supabase/demo/datos-prueba-alonso.sql`, `supabase/tools/seed-alonso.mjs`) como a través de los formularios del panel web administrativo (`#administracion`) y de emprendedora (`#mi-tienda`).

#### 1. Tiendas reales con punto de retiro en mapa
- **Artesanías Melí Alerce** (`shop_artesanias_alerce`):
  - *Sector*: Alerce Histórico.
  - *Descripción*: Taller familiar de artesanía en lana virgen, telar tradicional y madera nativa recuperada de rodados naturales.
  - *Punto de retiro*: `Taller Melí Alerce (Calle Los Canelos 245, Alerce Histórico)`.
  - *Coordenadas reales*: Latitud `-41.388531`, Longitud `-72.906845`.
  - *Contacto*: WhatsApp directo `+56984561234`.
- **Sabores y Conservas del Reloncaví** (`shop_sabores_sur`):
  - *Sector*: Puerto Montt Centro / Angelmó.
  - *Descripción*: Mermeladas campesinas reducidas en azúcar, conservas tradicionales y repostería artesanal con frutos silvestres recolectados en bosques del Reloncaví.
  - *Punto de retiro*: `Puesto 14, Mercado Angelmó, Puerto Montt`.
  - *Coordenadas reales*: Latitud `-41.478832`, Longitud `-72.956754`.
  - *Contacto*: Formulario web y correo `sabores@delreloncavi.cl`.

#### 2. Productos con variantes (distinta foto, distinto precio y stock > 1)
- **Manta artesanal en telar chilote** (`prod_manta_chilota` - Tienda Melí Alerce):
  - Modalidad: `UNITS` (Por unidades), stock total: 5 unidades (stock > 1).
  - *Variante 1*: `Color Crudo Natural (180x140 cm)`, 3 unidades, \$38.000 CLP, fotografía en telar crudo.
  - *Variante 2*: `Teñido Canelo y Barro (200x150 cm)`, 2 unidades, \$45.000 CLP, fotografía con tinte vegetal oscuro.
- **Pack de Mermeladas Silvestres del Reloncaví** (`prod_pack_mermeladas` - Tienda Sabores del Reloncaví):
  - Modalidad: `UNITS` (Por unidades), stock total: 8 unidades (stock > 1).
  - *Variante 1*: `Murta del Bosque (250g)`, 5 unidades, \$4.500 CLP, fotografía frasco hexagonal.
  - *Variante 2*: `Maqui y Grosella Familiar (500g)`, 3 unidades, \$7.500 CLP, fotografía frasco familiar grande.

#### 3. Productos en modalidad Pieza Única (stock = 1)
- **Reloj mural en madera de alerce muerto y resina** (`prod_reloj_alerce` - Tienda Melí Alerce):
  - Modalidad: `UNIQUE`, stock: 1 unidad, \$52.000 CLP.
  - Al venderse se oculta automáticamente de la vista pública (regla de negocio validada en `toPublicOrNull`).
- **Canasta Rústica Gourmet Edición Especial** (`prod_canasta_patagonia` - Tienda Sabores del Reloncaví):
  - Modalidad: `UNIQUE`, stock: 1 unidad, \$29.000 CLP.
  - Canastillo de mimbre con 4 variedades de dulces sureños y licor de oro tradicional.

#### 4. Asociación comunitaria con integrantes vinculadas
- **Asociación Gremial de Emprendedoras y Artesanas de Alerce** (`asoc_artesanas_alerce`):
  - *Descripción*: Agrupación de artesanas, hilanderas y productoras de Alerce Histórico y Alerce Norte para fortalecer ferias y oficios tradicionales.
  - *Sector*: Alerce y Puerto Montt.
  - *Integrantes vinculadas* (`shop_associations`): Ambas tiendas (`shop_artesanias_alerce` y `shop_sabores_sur`) figuran como socias activas.

#### 5. Ferias futuras en Puerto Montt y Alerce con coordenadas reales
- **Feria Navideña y Costumbrista Parque Urbano Alerce** (`fair_parque_urbano_alerce_2026`):
  - *Lugar*: Parque Urbano Alerce, Av. Transversal 1 s/n, Alerce Norte.
  - *Coordenadas*: `-41.397022, -72.908011`.
  - *Fechas*: 5 al 7 de diciembre de 2026 (futura).
  - *Estado*: `published`.
- **Feria de Artesanía y Tradiciones Plaza de Armas** (`fair_plaza_armas_puerto_montt_2026`):
  - *Lugar*: Plaza de Armas de Puerto Montt (Calle San Martín con Urmeneta).
  - *Coordenadas*: `-41.471714, -72.942912`.
  - *Fechas*: 12 al 14 de diciembre de 2026 (futura).
  - *Estado*: `published`.
- **Muestra Tradicional Alerce Histórico** (`fair_costumbrista_alerce_historico_2026`):
  - *Lugar*: Plaza Los Navegantes, Alerce Histórico, Puerto Montt.
  - *Coordenadas*: `-41.388531, -72.906845`.
  - *Fechas*: 19 al 20 de diciembre de 2026 (futura).
  - *Estado*: `published`.

Con esto se cumple el requisito de tener 2+ ferias futuras publicadas para que el ordenamiento por distancia y fecha de `upcoming_fairs` (A12, A13, W16, W17) opere de forma óptima sin avisos pendientes en `entrega6-state.mjs`.

---

### B. Ajustes de contenido web y corrección de fichas públicas

Se detectaron y resolvieron faltantes en la vitrina pública (`web/src/`):

1. **Actualización reactiva de estado al seleccionar variantes (`web/src/public-products.js`)**:
   - *Faltante*: Al cambiar entre variantes en el diálogo modal de producto, el distintivo `[data-availability-status]` no actualizaba si una variante específica estaba agotada o disponible; mantenía estático el estado global del producto.
   - *Ajuste*: Se integró la función `variantStatusText(variant)` y `variantTone(variant)` que refresca dinámicamente el badge («Disponible», «Agotado · consulta a la tienda» o «A pedido · hecho por encargo») y la guía de voz (`dataset.voiceGuide`) para lectores de pantalla.
2. **Visualización de la asociación en la ficha de tienda (`web/src/public-shops.js`)**:
   - *Faltante*: Cuando un visitante abría la ficha de una tienda (`#tienda/<id>`), no se mostraba a qué asociación comunitaria pertenecía la tienda, a pesar de estar registrado en `shop_associations`.
   - *Ajuste*: Se añadió la consulta concurrente de asociaciones activas y se desplegó el enlace interactivo `Asociación: <Nombre>` tanto en el banner principal como en el bloque de datos de contacto.
3. **Muestra de portadas de productos en la ficha de asociación (`web/src/public-shops.js`)**:
   - *Faltante*: En `#asociacion/<id>`, las tarjetas de las tiendas socias se renderizaban pasando un arreglo vacío `[]` de productos, provocando que todas aparecieran con el placeholder genérico «Sin foto».
   - *Ajuste*: Se cargan los productos públicos y se entregan a `card(shop, products)`, mostrando la fotografía real del producto representativo de cada tienda.
4. **Formato de imagen en ferias (`web/src/public-shops.js`, `web/src/design.css`)**:
   - *Faltante*: En la vista detallada de feria (`#feria/<id>`), el afiche se mostraba con la clase circular de logo de tienda, distorsionando imágenes panorámicas de afiches o recintos.
   - *Ajuste*: Se agregó la clase `.fair-logo-cover` con `border-radius: 14px` y `object-fit: cover`.

---

## 3. Requisitos y Checklist Cubiertos

| Código | Descripción | Aporte de Alonso Núñez |
|---|---|---|
| **W01–W02** | Catálogo público y vitrina comunitaria | Fichas públicas de tiendas y productos con información completa y actualizada. |
| **W05** | Asociación e integrantes en la web | Asociación visible con tiendas vinculadas y fotografías reales de productos en sus fichas. |
| **W16–W17** | Ferias públicas y mapa interactivo | 3 ferias futuras publicadas con coordenadas exactas de Puerto Montt y Alerce para el calendario y mapa. |
| **A12–A13** | Próximas ferias y cálculo de distancias | Al existir 2+ ferias futuras reales, la función `upcoming_fairs` ordena correctamente por km y fecha en Android. |
| **A18 / RF-MAP-04** | Punto de venta o retiro en mapa | Tiendas con `pickup_label`, `pickup_lat` y `pickup_lng` válidos en Puerto Montt y Alerce. |
| **RF-PRO-05 a 08** | Variantes con foto, precio y control de stock | Productos `UNITS` con variantes de foto y precio independientes y piezas únicas `UNIQUE` con stock = 1. |

---

## 4. Guía de Carga desde la Interfaz Web

Para replicar o ingresar datos adicionales directamente desde el navegador web (por ejemplo, en `https://conectasur-dev.web.app` o entorno local):

1. **Ingreso Administrativo**:
   - Ir a `#ingresar` con las credenciales de administrador (`admin@demo.conectasur.cl`).
   - Navegar a `#administracion`.
2. **Carga de Ferias (`fairs-admin.js`)**:
   - En la sección «Ferias y eventos en Puerto Montt», pulsar **Crear feria**.
   - Ingresar nombre, organizador, lugar, fechas de inicio y término.
   - En el mapa interactivo de Puerto Montt/Alerce, hacer clic en el punto exacto o buscar la dirección para autocompletar latitud y longitud.
   - Seleccionar estado **Publicada** y presionar **Guardar feria**.
3. **Carga de Asociación (`association-editor.js`)**:
   - En la pestaña «Asociaciones», pulsar **Crear asociación**.
   - Completar nombre («Asociación Gremial de Emprendedoras y Artesanas de Alerce»), sector y datos de contacto. Subir el logo y guardar.
   - En la lista de tiendas del administrador, asociar las tiendas correspondientes a la nueva asociación.
4. **Carga de Productos desde Mi Tienda (`owner-catalog.js`)**:
   - Ingresar a `#mi-tienda` con la cuenta de la emprendedora.
   - Pulsar **Agregar producto**:
     - *Paso 1*: Subir fotografía nítida.
     - *Paso 2*: Ingresar nombre, descripción, precio base y categoría.
     - *Paso 3*: Para productos con opciones, presionar **Agregar variante**, definiendo nombre de opción, cantidad, precio propio y foto específica. Para piezas únicas, omitir variantes.
     - *Paso 4*: Seleccionar modalidad (`Por unidades` o `Pieza única`). Revisar el resumen sonoro/visual y pulsar **Confirmar y guardar producto**.
