import { escapeHtml as esc } from './public-shops.js';
import { ownerShell, wireOwnerShell } from './owner-shell.js';
import { icon } from './visuals.js';
import { safeImageUrl, priceLabel } from './content.js';
import { prepareImage } from './prepare-image.js';
import { normalizeProduct, STOCK_MODES, SOLD_OUT_MODES } from '../product-model.js';

const options = (values, selected) => Object.entries(values).map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
const checked = value => value ? 'checked' : '';
const numeric = 'type="text" inputmode="numeric" pattern="[0-9]+"';
const stepGuides = [
  'Paso 1 de 4. Elige o toma una foto del producto. Busca buena luz y revisa que se vea completo. La foto se sube cuando confirmas el guardado. Pulsa Continuar para escribir los datos.',
  'Paso 2 de 4. Escribe el nombre, la descripción y el precio en pesos chilenos. Para ocho mil pesos escribe 8000, sin puntos ni comas. Puedes pulsar Hablar para escribir el nombre y la descripción. Elige la categoría y completa los detalles de tu producto.',
  'Paso 3 de 4. Si el producto tiene tallas, colores u otras opciones, puedes agregarlas aquí con sus unidades y precio. Si todas las unidades son iguales, pulsa Continuar. Una pieza única no usa estas opciones.',
  'Paso 4 de 4. Elige si vendes por unidades, una pieza única, por encargo o sin contar unidades. Revisa la cantidad y decide si publicar y mostrar el precio. Pulsa Revisar producto para escuchar o revisar el resumen antes de confirmar.'
];
const stepSummaries = ['Elige una foto donde se vea el producto completo.','Completa los datos del producto. Puedes escribir o hablar.','Agrega tallas o colores si los necesitas. También puedes continuar sin opciones.','Revisa las unidades disponibles y cómo quieres ofrecer el producto.'];
const image = (url, alt) => safeImageUrl(url) || url?.startsWith('blob:') ? `<img src="${esc(url)}" alt="${esc(alt)}">` : `<span>${icon('grid')}Sin foto</span>`;

// Los borradores permanecen en memoria mientras esta pantalla está abierta.
export function showOwnerCatalog(app, db, home, { isCurrent, onBack, onNavigate, onLogout }) {
  const shopId = home.shop.id, events = new AbortController();
  let stopped = false, busy = false, preparing = false, data = null, metadata = [], categories = [];
  let draft = null, initial = '', isNew = false, step = 0, photoFile = null, variantFiles = new Map();
  let search = '', category = '', selected = new Set(), previewUrls = new Map();
  const alive = () => !stopped && isCurrent();
  const dirty = () => !!draft && (JSON.stringify(draft) !== initial || !!photoFile || variantFiles.size > 0);
  const requestLeave = () => !busy && !preparing && (!dirty() || confirm('¿Salir sin guardar los cambios del producto?'));
  const revoke = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls.clear(); };
  function status(message, error = false) {
    const node = app.querySelector('#catalog-status');
    if (node) { node.textContent = message; node.className = `owner-status${error ? ' owner-error' : ''}`; node.setAttribute('role', error ? 'alert' : 'status'); }
  }
  function shell(content, title) {
    document.title = `${title} | ConectaSur`;
    app.innerHTML = ownerShell(home.shop, 'products', `<section class="owner-catalog-page"><div class="editor-heading"><div><p class="public-eyebrow">${esc(home.shop.name)} · Mi catálogo</p><h1 tabindex="-1">${title}</h1></div><button class="owner-secondary" data-action="back">Volver a Resumen</button></div>${content}<p id="catalog-status" class="owner-status" role="status"></p></section>`);
    wireOwnerShell(app, {
      onNavigate: target => { if (requestLeave()) (onNavigate ? onNavigate(target) : onBack()); },
      onLogout: () => { if (requestLeave()) onLogout?.(); }
    });
    app.querySelector('h1').focus({ preventScroll: true }); window.scrollTo(0, 0);
    app.querySelectorAll('img').forEach(img => img.addEventListener('error', () => { img.replaceWith(document.createTextNode('Imagen no disponible')); }, { once: true }));
  }
  function lock(value) {
    busy = value;
    app.querySelectorAll('button,input,select,textarea,fieldset').forEach(node => { node.disabled = value; });
  }
  async function load(notice = '') {
    draft = null; revoke(); photoFile = null; variantFiles.clear();
    shell('<p role="status">Buscando tus productos…</p>', 'Tus productos.');
    try {
      const result = await db.ownerCatalog(shopId);
      if (!alive()) return;
      data = result; selected.clear();
      const lists = await Promise.allSettled([db.listItems('productTypes'), db.listItems('categories')]);
      if (!alive()) return;
      if (lists[0].status === 'fulfilled') metadata = lists[0].value;
      if (lists[1].status === 'fulfilled') categories = lists[1].value.map(row => row.name);
      list(notice || (lists.some(result => result.status === 'rejected') ? 'No pudimos actualizar las sugerencias de tipos. Puedes conservar o escribir tus datos.' : ''));
    } catch { if (alive()) { shell('<p>No pudimos abrir tu catálogo. Revisa tu conexión.</p><button class="public-primary" data-action="reload">Intentar nuevamente</button>', 'Tus productos.'); } }
  }
  function list(notice = '') {
    const values = [...new Set(data.products.map(product => product.category))].sort();
    shell(`<div class="catalog-owner-intro"><p>Publica lo que haces y mantén tus cantidades al día. Tus cambios también estarán disponibles en Android.</p><button class="public-primary" data-action="new">${icon('grid')}Agregar producto</button></div>
      <div class="owner-catalog-tools"><div><label for="catalog-search">Buscar en mis productos</label><input id="catalog-search" type="search" value="${esc(search)}" placeholder="Nombre del producto"></div><div><label for="catalog-category">Categoría</label><select id="catalog-category">${options({ '': 'Todas', ...Object.fromEntries(values.map(value => [value, value])) }, category)}</select></div><button class="owner-secondary" data-action="reload">Actualizar catálogo</button></div>
      <p id="catalog-count" role="status"></p><div id="owner-product-list" class="owner-product-list"></div>
      <details class="editor-card catalog-bulk"><summary>Actualizar varios productos</summary><p>Selecciona productos con sus casillas y elige un cambio de publicación.</p><label for="bulk-setting">Cambio para los seleccionados</label><select id="bulk-setting"><option value="visible:true">Publicar</option><option value="visible:false">Ocultar</option><option value="show_price:true">Mostrar precios</option><option value="show_price:false">Ocultar precios</option><option value="sold_out:HIDE">Al agotarse: ocultar</option><option value="sold_out:SHOW">Al agotarse: mostrar agotado</option><option value="sold_out:ORDER">Al agotarse: recibir encargos</option></select><button class="owner-secondary" data-action="bulk">Aplicar a los seleccionados</button></details>
      <details class="editor-card catalog-defaults"><summary>Preferencias para productos nuevos</summary><p>Se aplican al crear un producto en la web o en Android. No cambian los que ya tienes.</p><form id="defaults-form"><label for="default-stock">Modalidad habitual</label><select id="default-stock">${options(STOCK_MODES, data.shop.defaultProducts?.stockMode || 'UNITS')}</select><label for="default-sold">Cuando se agoten</label><select id="default-sold">${options(SOLD_OUT_MODES, data.shop.defaultProducts?.soldOut || 'HIDE')}</select><label class="editor-check"><input id="default-visible" type="checkbox" ${checked(data.shop.defaultProducts?.visible !== false)}>Publicar productos nuevos</label><label class="editor-check"><input id="default-price" type="checkbox" ${checked(data.shop.defaultProducts?.showPrice !== false)}>Mostrar sus precios</label><button class="owner-secondary" type="submit">Guardar preferencias</button></form></details>`, 'Tus productos.');
    renderCards(); status(notice);
  }
  function renderCards() {
    const products = data.products.filter(product => product.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')) && (!category || product.category === category));
    app.querySelector('#catalog-count').textContent = `${products.length} producto${products.length === 1 ? '' : 's'} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`;
    app.querySelector('#owner-product-list').innerHTML = products.length ? products.map(product => {
      const stateClass = !product.visible ? 'state-hidden' : product.quantity === 0 ? 'state-empty' : 'state-published';
      const stateLabel = `${product.visible ? 'Publicado' : 'Oculto'}${product.quantity === 0 ? ' · Sin unidades' : ''}`;
      return `<article class="owner-product-card"><div class="owner-product-photo">${image(product.photo, product.name)}</div><div class="owner-product-body"><label class="editor-check"><input type="checkbox" data-select="${esc(product.id)}" ${checked(selected.has(product.id))}>Seleccionar ${esc(product.name)}</label><h2>${esc(product.name)}</h2><p>${esc(product.category)} · ${esc(STOCK_MODES[product.stockMode])}</p><strong>${esc(priceLabel(product))}</strong><p>${['UNITS','UNIQUE'].includes(product.stockMode) ? `${product.quantity} ${product.quantity === 1 ? 'unidad disponible' : 'unidades disponibles'}` : 'Sin conteo de unidades'}${product.variants.length ? ` · ${product.variants.length} ${product.variants.length === 1 ? 'variante' : 'variantes'}` : ''}</p><span class="owner-product-state ${stateClass}">${stateLabel}</span><div class="owner-product-actions"><button class="owner-secondary" data-edit="${esc(product.id)}">Editar producto</button><button class="editor-remove" data-delete="${esc(product.id)}">Eliminar</button></div></div></article>`;
    }).join('') : `<div class="owner-empty"><h2>${data.products.length ? 'No hay coincidencias.' : 'Aquí empieza tu catálogo.'}</h2><p>${data.products.length ? 'Prueba otro nombre o categoría.' : 'Agrega una foto y cuéntale a tu comunidad qué ofreces.'}</p></div>`;
    app.querySelectorAll('.owner-product-photo img').forEach(img => img.onerror = () => { img.replaceWith(document.createTextNode('Imagen no disponible')); });
  }
  function open(product) {
    revoke(); photoFile = null; variantFiles.clear(); step = 0; isNew = !product;
    draft = product ? structuredClone(product) : { id: crypto.randomUUID(), shopId, name: '', description: '', category: 'Artesanías', productType: metadata[0]?.id || 'artesania', attributes: {}, priceClp: '', quantity: 1, photo: '', variants: [], ...{ stockMode: 'UNITS', soldOut: 'HIDE', visible: true, showPrice: true }, ...data.shop.defaultProducts };
    initial = JSON.stringify(draft); edit();
  }
  const field = (label, key, value, extra = '') => `<label for="product-${key}">${esc(label)}</label><input id="product-${key}" data-field="${key}" ${key === 'name' ? 'data-dictation-field' : ''} value="${esc(value ?? '')}" ${extra}>${key === 'name' ? `<button type="button" class="dictation-action" data-dictate-for="product-name">${icon('microphone')}Hablar para escribir el nombre</button>` : ''}`;
  function edit(message = '', error = false) {
    const names = ['Foto','Datos','Tallas y colores','Unidades y publicación'];
    let content;
    if (step === 0) content = `<div class="product-photo-layout"><div class="product-edit-photo">${image(previewUrls.get('main') || draft.photo, 'Foto del producto')}</div><div><h2>Una buena foto ayuda a vender.</h2><p>Apoya el producto, busca luz natural y deja el fondo despejado. Revisa que se vea completo.</p><label class="owner-secondary editor-file-label" for="product-photo">Elegir o tomar foto</label><input class="editor-file-input" id="product-photo" type="file" accept="image/jpeg,image/png,image/webp" data-photo="main"><button type="button" class="editor-remove" data-action="remove-photo">Quitar foto</button><p class="editor-hint">JPG, PNG o WebP, hasta 20 MB. Ajustamos la imagen antes de subirla. Puedes guardar sin foto si dejas el producto oculto.</p></div></div>`;
    if (step === 1) {
      const typeFields = metadata.find(type => type.id === draft.productType)?.fields || {};
      const keys = [...new Set([...Object.keys(typeFields), ...Object.keys(draft.attributes)])];
      content = `${field('Nombre del producto','name',draft.name,'maxlength="120" required')}<label for="product-description">Descripción</label><textarea id="product-description" data-field="description" data-dictation-field rows="4" maxlength="1000" placeholder="Qué es, cómo está hecho y qué necesita saber quien lo compra.">${esc(draft.description)}</textarea><button type="button" class="dictation-action" data-dictate-for="product-description">${icon('microphone')}Hablar para escribir la descripción</button><div class="editor-two-fields"><div>${field('Precio en pesos chilenos','priceClp',draft.priceClp,`${numeric} required aria-describedby="clp-help"`)}<p id="clp-help" class="editor-hint">Ejemplo: escribe 8000 para ocho mil pesos chilenos, sin puntos ni comas.</p></div><div>${field('Categoría','category',draft.category,'list="product-categories" maxlength="120" required')}<datalist id="product-categories">${[...new Set([...categories, draft.category])].map(value => `<option value="${esc(value)}">`).join('')}</datalist><div class="category-choices" aria-label="Categorías sugeridas">${[...new Set([...categories,...data.products.map(product=>product.category)])].filter(Boolean).slice(0,8).map(value=>{const sample=data.products.find(product=>product.category===value && safeImageUrl(product.photo));return `<button type="button" data-category-choice="${esc(value)}" aria-pressed="${value===draft.category}">${sample ? `<img src="${esc(sample.photo)}" alt="">` : icon(value.toLocaleLowerCase('es').includes('planta') ? 'leaf' : value.toLocaleLowerCase('es').includes('alimento') ? 'food' : 'tag')}${esc(value)}</button>`;}).join('')}</div></div></div><p class="editor-hint">Las flores tejidas y las creaciones hechas con fibras vegetales pueden ir en Artesanías. Plantas corresponde a plantas vivas.</p><label for="product-type">Tipo de producto</label><select id="product-type" data-field="productType">${options(Object.fromEntries([...metadata.map(type => [type.id, type.name]), ...(!metadata.some(type => type.id === draft.productType) ? [[draft.productType, draft.productType]] : [])]), draft.productType)}</select><div class="editor-two-fields">${keys.map(key => `<div><label for="attr-${esc(key)}">${esc(key.replaceAll('_',' '))}</label><input id="attr-${esc(key)}" data-attribute="${esc(key)}" value="${esc(draft.attributes[key] || '')}" maxlength="1000"></div>`).join('')}</div>`;
    }
    if (step === 2) content = `<h2>¿Tiene tallas, colores u otras opciones?</h2><p>Si todas las unidades son iguales, continúa sin agregar variantes. Si tiene opciones distintas, agrega todas las opciones aquí (por ejemplo: Estándar y Grande).</p>${draft.variants.length === 1 ? '<p class="sales-notice">Tienes solo 1 variante. Si tu producto tiene más opciones, agrega la segunda variante.</p>' : ''}<div class="product-variants">${draft.variants.map((variant,index) => `<fieldset class="product-variant" data-variant="${esc(variant.id)}"><legend>Variante ${index + 1}</legend><label for="variant-${index}-label">Nombre de la variante</label><input id="variant-${index}-label" data-variant-field="label" value="${esc(variant.label)}" maxlength="120" required><div class="editor-two-fields"><div><label for="variant-${index}-quantity">Unidades de esta variante</label><input id="variant-${index}-quantity" data-variant-field="quantity" value="${esc(variant.quantity)}" ${numeric} required><p class="editor-hint">Solo se cuentan en la modalidad Por unidades.</p></div><div><label for="variant-${index}-price">Precio propio en pesos chilenos (opcional)</label><input id="variant-${index}-price" data-variant-field="priceClp" value="${esc(variant.priceClp ?? '')}" ${numeric}><p class="editor-hint">Vacío: usa el precio del producto.</p></div></div><div class="variant-photo">${image(previewUrls.get(variant.id) || variant.photo, 'Foto de variante')}</div><label class="owner-secondary editor-file-label" for="variant-photo-${index}">Elegir foto de variante</label><input class="editor-file-input" id="variant-photo-${index}" data-photo="${esc(variant.id)}" type="file" accept="image/jpeg,image/png,image/webp"><button class="editor-remove" type="button" data-clear-variant-photo="${esc(variant.id)}">Usar foto del producto</button><button class="editor-remove" type="button" data-remove-variant="${esc(variant.id)}">Quitar variante</button></fieldset>`).join('')}</div><div class="owner-actions">${draft.variants.length === 0 ? '<button class="owner-secondary" data-action="copy-main-variant" type="button">Usar foto y precio principal como Variante 1</button>' : ''}<button class="owner-secondary" data-action="add-variant" type="button">Agregar variante</button></div>`;
    if (step === 3) {
      const availableModes = draft.variants.length
        ? Object.fromEntries(Object.entries(STOCK_MODES).filter(([key]) => key !== 'UNIQUE'))
        : STOCK_MODES;
      if (draft.variants.length && draft.stockMode === 'UNIQUE') draft.stockMode = 'UNITS';
      content = `<h2>Decide cómo lo vas a ofrecer.</h2><label for="product-stock">Modalidad del producto</label><select id="product-stock" data-field="stockMode">${options(availableModes,draft.stockMode)}</select><p class="editor-hint">${draft.variants.length ? 'Como agregaste variantes, la modalidad «Pieza única» no está disponible (si es una pieza única, quita las variantes en el paso anterior).' : 'Por unidades: descuenta existencias. Pieza única: hay una sola. Por encargo: lo preparas a pedido. Sin contar unidades: no necesitas llevar una cantidad.'}</p>${['UNITS','UNIQUE'].includes(draft.stockMode) ? draft.variants.length ? `<p class="product-stock-summary">La cantidad se obtiene sumando las unidades de tus variantes. Revísalas en el paso anterior.</p>` : field(draft.stockMode === 'UNIQUE' ? 'Disponible (1) o vendido (0)' : 'Unidades disponibles','quantity',draft.quantity,`${numeric} required`) : '<p class="product-stock-summary">En esta modalidad no se lleva conteo de unidades.</p>'}<label for="product-sold">Cuando no queden unidades</label><select id="product-sold" data-field="soldOut">${options(SOLD_OUT_MODES,draft.soldOut)}</select><p class="editor-hint">La pieza única vendida siempre se oculta. Las opciones de agotado se aplican a productos por unidades.</p><label class="editor-check"><input type="checkbox" data-field="visible" ${checked(draft.visible)}>Publicar en mi catálogo</label><label class="editor-check"><input type="checkbox" data-field="showPrice" ${checked(draft.showPrice)}>Mostrar el precio</label>${data.shop.showPrices === false ? '<p class="editor-hint">Tu tienda tiene los precios ocultos. Seguirán ocultos hasta que actives esa opción en Editar tienda.</p>' : ''}<p class="editor-hint">La publicación requiere una foto. Un producto agotado puede quedar oculto según la modalidad elegida.</p>`;
    }
    shell(`<ol class="product-steps" aria-label="Pasos del producto">${names.map((name,index) => `<li ${index === step ? 'aria-current="step"' : ''}><span>${index + 1}</span>${name}</li>`).join('')}</ol><form id="product-form" novalidate><fieldset class="editor-card product-step" data-voice-guide="${esc(stepGuides[step])}"><legend class="visually-hidden">${names[step]}</legend><div class="step-guidance"><p>${esc(stepSummaries[step])}</p><button type="button" class="dictation-action" data-listen>${icon('volume')}Escuchar este paso</button><button type="button" class="dictation-action" data-pause-reading hidden>Pausar lectura</button><button type="button" class="dictation-action" data-stop-reading hidden>Detener lectura</button><p data-reading-status role="status"></p><details class="step-more"><summary>Ver instrucciones</summary><p>${esc(stepGuides[step])}</p></details></div>${content}</fieldset><div class="editor-save-bar"><p>Paso ${step + 1} de 4 · Los cambios se publican al guardar.</p><div><button type="button" class="owner-secondary" data-action="cancel">Cancelar</button>${step ? '<button type="button" class="owner-secondary" data-action="previous">Anterior</button>' : ''}<button type="submit" class="public-primary">${step === 3 ? 'Revisar producto' : 'Continuar'}</button></div></div><button hidden type="button" id="product-reload" class="owner-secondary" data-action="reload-product">Cargar versión actual</button></form>`, isNew ? 'Agrega tu producto.' : 'Edita tu producto.');
    status(message,error);
  }
  function review() {
    let row;
    try { row=normalizeProduct(draft,shopId,{pendingPhoto:!!photoFile,pendingVariants:new Set(variantFiles.keys())}); }
    catch(error) { step=error.step ?? 1;edit(error.message,true);return; }
    const counts=['UNITS','UNIQUE'].includes(row.stock_mode);
    const price=value=>new Intl.NumberFormat('es-CL').format(value)+' pesos chilenos';
    const quantities=counts ? `${row.quantity} unidades disponibles` : 'Sin conteo de unidades';
    const priceVisibility=row.show_price && data.shop.showPrices !== false ? 'Al publicarlo, el precio será visible para los compradores.' : 'Al publicarlo, el precio quedará oculto para los compradores.';
    const speech=`Revisa tu producto antes de confirmar. Nombre: ${row.name}. Descripción: ${row.description || 'Sin descripción'}. Categoría: ${row.category}. Precio: ${row.price_clp} pesos chilenos. ${priceVisibility} Modalidad: ${STOCK_MODES[row.stock_mode]}. ${quantities}. ${row.visible ? 'La publicación estará activada.' : 'Se guardará oculto.'} ${row.variants.map(option=>`Opción ${option.label}. ${counts ? option.quantity+' unidades.' : ''} Precio: ${option.priceClp ?? row.price_clp} pesos chilenos.`).join(' ')} Puedes volver a corregir o confirmar el guardado.`;
    const dialog=document.createElement('dialog');dialog.id='product-review';dialog.className='assistance-dialog';
    dialog.setAttribute('aria-labelledby','product-review-title');dialog.dataset.voiceGuide=speech;
    dialog.innerHTML=`<h2 id="product-review-title">Revisa tu producto.</h2><div class="product-review-header">${image(previewUrls.get('main') || draft.photo,'Foto que vas a guardar')}<p>Estos datos se guardarán cuando confirmes. Puedes volver a corregirlos.</p></div><dl class="product-review-values"><dt>Nombre</dt><dd>${esc(row.name)}</dd><dt>Descripción</dt><dd>${esc(row.description || 'Sin descripción')}</dd><dt>Categoría</dt><dd>${esc(row.category)}</dd><dt>Precio</dt><dd>${esc(price(row.price_clp))}</dd><dt>Modalidad</dt><dd>${esc(STOCK_MODES[row.stock_mode])}</dd><dt>Unidades</dt><dd>${esc(quantities)}</dd><dt>Publicación</dt><dd>${row.visible ? 'Activada, según disponibilidad' : 'Se guardará oculto'}</dd></dl><p>${esc(priceVisibility)}</p>${row.variants.length ? `<h3>Tallas, colores u otras opciones</h3><ul class="product-review-options">${row.variants.map(option=>`<li>${esc(option.label)}: ${counts ? option.quantity+' unidades · ' : ''}${esc(price(option.priceClp ?? row.price_clp))}</li>`).join('')}</ul>` : ''}<p data-reading-status role="status"></p><div class="assistance-actions"><button type="button" data-listen>${icon('volume')}Escuchar resumen</button><button type="button" data-pause-reading hidden>Pausar lectura</button><button type="button" data-stop-reading hidden>Detener lectura</button><button type="button" data-action="close-review">Volver a corregir</button><button type="button" class="public-primary" data-action="confirm-save">${row.visible ? 'Confirmar y guardar producto' : 'Confirmar y guardar oculto'}</button></div>`;
    dialog.addEventListener('close',()=>{dialog.remove();app.querySelector('#product-form button[type=submit]')?.focus({preventScroll:true});},{once:true});
    app.append(dialog);dialog.showModal();dialog.querySelector('h2').setAttribute('tabindex','-1');dialog.querySelector('h2').focus({preventScroll:true});dialog.scrollTop=0;
  }
  async function save() {
    try { normalizeProduct(draft, shopId, { pendingPhoto: !!photoFile, pendingVariants: new Set(variantFiles.keys()) }); }
    catch (error) { step = error.step ?? 1; edit(error.message,true); return; }
    lock(true); status('Guardando el producto… No cierres esta pantalla.');
    try {
      await db.saveOwnerProduct(shopId,draft,{ isNew, photoFile, variantFiles, onUpload: ({id,url}) => {
        if (id === null) { draft.photo = url; photoFile = null; } else { draft.variants.find(variant => variant.id === id).photo = url; variantFiles.delete(id); }
      }});
      if (alive()) { lock(false); await load('Guardamos tu producto. El catálogo público se actualiza según tus opciones de publicación.'); }
    } catch (error) {
      if (alive()) { lock(false); status(error.code === 'product_changed' ? error.message : 'No pudimos guardar. Revisa tu conexión y vuelve a intentarlo. Tus cambios siguen en esta pantalla.',true); if (error.code === 'product_changed') app.querySelector('#product-reload').hidden = false; }
    } finally { busy = false; }
  }
  async function action(name) {
    if (busy || preparing) return;
    if (name === 'back') { if (requestLeave()) onBack(); }
    if (name === 'reload') await load();
    if (name === 'new') open();
    if (name === 'cancel') { if (requestLeave()) await load(); }
    if (name === 'previous') { step--; edit(); }
    if (name === 'close-review') app.querySelector('#product-review')?.close();
    if (name === 'confirm-save') { app.querySelector('#product-review')?.close(); await save(); }
    if (name === 'remove-photo') { photoFile = null; draft.photo = ''; if (previewUrls.has('main')) URL.revokeObjectURL(previewUrls.get('main')); previewUrls.delete('main'); edit(); }
    if (name === 'add-variant') { if (draft.variants.length >= 100) { status('Se admiten hasta 100 variantes.',true); return; } draft.variants.push({id:crypto.randomUUID(),label:'',quantity:0,priceClp:null,photo:null}); edit(); }
    if (name === 'copy-main-variant') {
      const id = crypto.randomUUID();
      if (photoFile) variantFiles.set(id, photoFile);
      if (previewUrls.has('main')) previewUrls.set(id, previewUrls.get('main'));
      draft.variants.push({ id, label: 'Estándar', quantity: Number(draft.quantity) || 1, priceClp: draft.priceClp || null, photo: draft.photo || null });
      edit('Creamos la Variante 1 con tu foto y precio principal. Ahora puedes agregar la Variante 2.');
    }
    if (name === 'reload-product' && requestLeave()) {
      lock(true); try { const fresh = await db.ownerCatalog(shopId); if (!alive()) return; data = fresh; const product = data.products.find(value => value.id === draft.id); if (product) open(product); else await load('Este producto ya fue eliminado.'); } catch { status('No pudimos cargar el producto. Intenta nuevamente.',true); } finally { if(alive()) lock(false); }
    }
    if (name === 'bulk') {
      if (!selected.size) { status('Selecciona al menos un producto.',true); return; }
      if (!confirm(`¿Aplicar el cambio a ${selected.size} productos seleccionados?`)) return;
      const [key,value] = app.querySelector('#bulk-setting').value.split(':');
      lock(true); try { await db.setOwnerAvailability(shopId,{ids:[...selected],settings:{[key]:value === 'true' ? true : value === 'false' ? false : value}}); if(alive()) {lock(false);await load('Actualizamos los productos seleccionados.');} } catch { if(alive()) status('No pudimos actualizar los productos. Revisa la conexión.',true); } finally { if(alive()) lock(false); }
    }
  }
  app.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || busy || preparing) return;
    const { action: name, edit: id, delete: deleting, removeVariant, clearVariantPhoto } = button.dataset;
    if (name) await action(name);
    if (button.hasAttribute('data-category-choice')) { draft.category=button.dataset.categoryChoice; const field=app.querySelector('#product-category');field.value=draft.category; app.querySelectorAll('[data-category-choice]').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button))); }
    if (id) open(data.products.find(product => product.id === id));
    if (removeVariant) { draft.variants = draft.variants.filter(variant => variant.id !== removeVariant); variantFiles.delete(removeVariant); if(previewUrls.has(removeVariant)) URL.revokeObjectURL(previewUrls.get(removeVariant)); previewUrls.delete(removeVariant); edit(); }
    if (clearVariantPhoto) { draft.variants.find(variant => variant.id === clearVariantPhoto).photo = null; variantFiles.delete(clearVariantPhoto); if(previewUrls.has(clearVariantPhoto)) URL.revokeObjectURL(previewUrls.get(clearVariantPhoto));previewUrls.delete(clearVariantPhoto); edit(); }
    if (deleting) {
      const product = data.products.find(value => value.id === deleting);
      if (!confirm(`¿Eliminar «${product.name}»? Dejará de aparecer en el catálogo. Esta acción no se puede deshacer.`)) return;
      lock(true); try { await db.deleteOwnerProduct(shopId,deleting,product.updatedAt); if(alive()) {lock(false);await load('Eliminamos el producto.');} } catch(error) { if(alive()) status(error.code === 'product_changed' ? error.message : 'No pudimos eliminar. Revisa la conexión y actualiza el catálogo.',true); } finally { if(alive()) lock(false); }
    }
  },{signal:events.signal});
  app.addEventListener('input', event => {
    const target = event.target;
    if (target.id === 'catalog-search') {search = target.value;renderCards();}
    if (!draft) return;
    if (target.dataset.field) draft[target.dataset.field] = target.type === 'checkbox' ? target.checked : target.value;
    if (target.dataset.attribute) draft.attributes[target.dataset.attribute] = target.value;
    if (target.dataset.variantField) draft.variants.find(variant => variant.id === target.closest('[data-variant]').dataset.variant)[target.dataset.variantField] = target.value;
  },{signal:events.signal});
  app.addEventListener('change', async event => {
    const target = event.target;
    if (target.id === 'catalog-category') { category = target.value; renderCards(); }
    if (target.dataset.select) {
      target.checked ? selected.add(target.dataset.select) : selected.delete(target.dataset.select);
      const count = data.products.filter(product => product.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')) && (!category || product.category === category)).length;
      app.querySelector('#catalog-count').textContent = `${count} producto${count === 1 ? '' : 's'} · ${selected.size} seleccionado${selected.size === 1 ? '' : 's'}`;
    }
    if (target.dataset.field === 'stockMode' || target.dataset.field === 'productType') { draft[target.dataset.field] = target.value; edit(); }
    if (target.dataset.photo && target.files?.[0]) {
      const key = target.dataset.photo; preparing = true; lock(true); status('Preparando la foto…');
      try { const file = await prepareImage(target.files[0]); if (!alive()) return; if(previewUrls.has(key)) URL.revokeObjectURL(previewUrls.get(key)); previewUrls.set(key,URL.createObjectURL(file)); if(key === 'main') photoFile = file;else variantFiles.set(key,file); edit('Foto lista. Se subirá al guardar.'); } catch(error) {if(alive()) status(error.message,true);} finally {preparing = false;if(alive()) lock(false);}
    }
  },{signal:events.signal});
  app.addEventListener('submit', async event => {
    if (!['product-form','defaults-form'].includes(event.target.id)) return;
    event.preventDefault();if(busy || preparing)return;
    if (event.target.id === 'product-form') { if(step < 3) {step++;edit();} else review(); }
    else {
      const defaults = {stockMode:app.querySelector('#default-stock').value,soldOut:app.querySelector('#default-sold').value,visible:app.querySelector('#default-visible').checked,showPrice:app.querySelector('#default-price').checked};
      lock(true);try {await db.saveProductDefaults(shopId,defaults);if(alive()){data.shop.defaultProducts = defaults;status('Guardamos las preferencias para tus productos nuevos.');}}catch{if(alive())status('No pudimos guardar las preferencias. Intenta nuevamente.',true);}finally{if(alive())lock(false);}
    }
  },{signal:events.signal});
  window.addEventListener('beforeunload',event => {if(dirty() || busy || preparing){event.preventDefault();event.returnValue = ''; }},{signal:events.signal});
  load();
  return {requestLeave,dispose(){stopped = true;events.abort();revoke();}};
}
