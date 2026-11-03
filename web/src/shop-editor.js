import { publicShell, shopLogo, wireShopImages, escapeHtml as escape } from './public-shops.js';
import { icon } from './visuals.js';
import { prepareImage } from './prepare-image.js';

export function showShopEditor(app, db, data, { isCurrent, onSaved, onCancel }) {
  const { shop } = data;
  let disposed = false, saving = false, preparing = false, saved = false;
  let logoFile = null, removeLogo = false, previewUrl = null;
  const events = new AbortController();
  const alive = () => !disposed && isCurrent();
  const fields = ['name', 'description', 'entrepreneurType', 'sector', 'contact'];
  const initial = Object.fromEntries(fields.map(key => [key, (shop[key] || '').replace(/\r\n?/g, '\n')]));
  initial.showPrices = shop.showPrices !== false;
  document.title = 'Editar mi tienda | ConectaSur';
  app.innerHTML = publicShell(`<section class="shop-editor-page" aria-labelledby="shop-editor-title">
    <div class="editor-heading"><div><p class="public-eyebrow">Mi tienda</p><h1 id="shop-editor-title" tabindex="-1">Dale tu sello a tu tienda.</h1><p>Revisa tus datos y el logo antes de publicarlos.</p></div><button id="editor-back" class="owner-secondary" type="button">Volver a Mi tienda</button></div>
    <form id="shop-editor-form">
      <fieldset id="shop-editor-fields"><legend class="visually-hidden">Datos y logo de tu tienda</legend><div class="shop-editor-layout">
        <section class="editor-card" aria-labelledby="editor-data-title"><h2 id="editor-data-title">Datos de tu tienda</h2><p class="editor-intro">Así te conocerán quienes visiten tu ficha pública.</p>
          <label for="edit-shop-name">Nombre de la tienda</label><input id="edit-shop-name" name="name" maxlength="120" required value="${escape(initial.name)}" autocomplete="organization">
          <label for="edit-shop-description">Descripción</label><textarea id="edit-shop-description" name="description" maxlength="1000" rows="5" placeholder="Cuenta qué ofreces y qué hace especial a tu emprendimiento.">${escape(initial.description)}</textarea><p class="editor-hint">Puedes contar qué haces, con qué materiales trabajas y si aceptas encargos.</p>
          <div class="editor-two-fields"><div><label for="edit-shop-type">Tipo de emprendimiento</label><input id="edit-shop-type" name="entrepreneurType" maxlength="120" value="${escape(initial.entrepreneurType)}" list="shop-type-options"><datalist id="shop-type-options"></datalist></div><div><label for="edit-shop-sector">Sector</label><input id="edit-shop-sector" name="sector" maxlength="240" value="${escape(initial.sector)}" list="shop-sector-options" placeholder="Ejemplo: Alerce"><datalist id="shop-sector-options"></datalist></div></div>
          <label for="edit-shop-contact">Datos de contacto</label><textarea id="edit-shop-contact" name="contact" maxlength="240" rows="2" placeholder="Tu teléfono, correo o enlace de contacto.">${escape(initial.contact)}</textarea>
          <label class="editor-check" for="edit-shop-prices"><input id="edit-shop-prices" name="showPrices" type="checkbox" ${initial.showPrices ? 'checked' : ''}>Mostrar los precios de mis productos</label><p class="editor-hint">Si los ocultas, las personas verán «Consultar precio».</p>
        </section>
        <aside class="editor-card editor-logo-card" aria-labelledby="editor-logo-title"><h2 id="editor-logo-title">Logo de tu emprendimiento</h2><p class="editor-intro">Una imagen que ayude a reconocer tu tienda.</p><div id="editor-logo-preview" class="editor-logo-preview">${shopLogo(shop, true)}</div><p id="editor-logo-status" class="editor-hint" role="status">${shop.logoUrl ? 'Este es tu logo actual.' : 'Aún no has agregado un logo.'}</p>
          <label class="owner-secondary editor-file-label" for="edit-shop-logo">${icon('shop')}Elegir imagen</label><input class="editor-file-input" id="edit-shop-logo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="editor-logo-status editor-logo-help">
          <button class="editor-remove" type="button" id="editor-remove-logo">Quitar logo</button>
          <p id="editor-logo-help" class="editor-hint">JPG, PNG o WebP. Ajustaremos la imagen antes de subirla. Los cambios se publican al guardar.</p>
          <div class="editor-photo-tip">${icon('check')}<p>Usa una imagen nítida, con buena luz y con tu logo completo dentro del encuadre.</p></div>
        </aside>
      </div></fieldset>
      <div class="editor-save-bar"><div><strong>Tus cambios se verán en la web y en Android.</strong><p>También se actualizará tu ficha pública.</p></div><div><button id="editor-cancel" class="owner-secondary" type="button">Cancelar</button><button id="editor-save" class="public-primary" type="submit">${icon('check')}Guardar cambios</button></div></div>
      <p id="editor-status" class="editor-status" role="status" tabindex="-1"></p>
    </form>
  </section>`);
  app.querySelector('#shop-editor-title').focus({ preventScroll: true });
  window.scrollTo(0, 0);
  wireShopImages(app);
  const form = app.querySelector('#shop-editor-form');
  const status = app.querySelector('#editor-status');
  const save = app.querySelector('#editor-save');
  const fileInput = app.querySelector('#edit-shop-logo');
  const logoStatus = app.querySelector('#editor-logo-status');
  const preview = app.querySelector('#editor-logo-preview');

  function values() {
    return Object.fromEntries([...fields.map(key => [key, form.elements.namedItem(key).value]), ['showPrices', form.elements.namedItem('showPrices').checked]]);
  }
  function hasChanges() { return !saved && (preparing || logoFile !== null || removeLogo || JSON.stringify(values()) !== JSON.stringify(initial)); }
  function tell(message, error = false) {
    status.textContent = message;
    status.className = 'editor-status' + (error ? ' owner-error' : '');
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function controls() {
    save.disabled = saving || preparing;
    app.querySelector('#editor-back').disabled = saving;
    app.querySelector('#editor-cancel').disabled = saving;
    app.querySelector('#shop-editor-fields').disabled = saving;
    app.querySelector('#editor-remove-logo').disabled = saving || preparing || (!logoFile && (removeLogo || !shop.logoUrl));
    fileInput.disabled = saving || preparing;
    save.setAttribute('aria-busy', String(saving));
  }
  function releasePreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; }
  function requestLeave() {
    if (saving) { tell('Estamos guardando tus cambios. Espera un momento.'); return false; }
    return !hasChanges() || window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?');
  }
  const cancel = () => { if (requestLeave()) onCancel(); };
  app.querySelector('#editor-back').addEventListener('click', cancel);
  app.querySelector('#editor-cancel').addEventListener('click', cancel);
  form.querySelector('[name="name"]').addEventListener('input', event => event.target.setCustomValidity(''));
  fileInput.addEventListener('change', async () => {
    const selected = fileInput.files[0];
    if (!selected) return;
    preparing = true; controls(); logoStatus.textContent = 'Preparando tu imagen…';
    try {
      const prepared = await prepareImage(selected);
      if (!alive()) return;
      releasePreview(); logoFile = prepared; removeLogo = false;
      previewUrl = URL.createObjectURL(prepared);
      const image = document.createElement('img'); image.src = previewUrl; image.alt = 'Vista previa del nuevo logo';
      preview.replaceChildren(image);
      logoStatus.textContent = 'Nueva imagen lista. Se publicará al guardar.';
      tell('Revisa tu logo y pulsa Guardar cambios cuando esté listo.');
    } catch (error) {
      if (alive()) { logoStatus.textContent = 'La imagen anterior se conserva.'; tell(error.message, true); }
    } finally { preparing = false; if (alive()) { fileInput.value = ''; controls(); } }
  });
  app.querySelector('#editor-remove-logo').addEventListener('click', () => {
    releasePreview(); logoFile = null; removeLogo = Boolean(shop.logoUrl);
    preview.innerHTML = shopLogo({ ...shop, logoUrl: null }, true);
    logoStatus.textContent = shop.logoUrl ? 'El logo se quitará al guardar los cambios.' : 'Aún no has agregado un logo.';
    tell('Revisa tus cambios antes de guardarlos.'); controls();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || preparing) return;
    const changes = values();
    if (!changes.name.trim()) { const name = form.elements.namedItem('name'); name.setCustomValidity('Escribe el nombre de tu tienda.'); name.reportValidity(); return; }
    saving = true; controls(); tell('Guardando tu tienda…');
    try {
      const result = await db.saveEntrepreneurShop(shop.id, changes, { logoFile, removeLogo });
      if (!alive()) return;
      saved = true; onSaved(result);
    } catch (error) {
      if (!alive()) return;
      const message = ['invalid_shop', 'invalid_logo', 'shop_changed'].includes(error.code) ? error.message
        : error.code === 'account_inactive' ? 'Tu cuenta está desactivada. Consulta al administrador antes de guardar.'
        : 'No pudimos confirmar el guardado. Conservamos lo que escribiste aquí. Revisa tu conexión y vuelve a intentarlo.';
      tell(message, true); status.focus({ preventScroll: false });
    } finally { saving = false; if (alive()) controls(); }
  });
  window.addEventListener('beforeunload', event => {
    if (hasChanges() || saving) { event.preventDefault(); event.returnValue = ''; }
  }, { signal: events.signal });
  Promise.allSettled([db.listItems('entrepreneurTypes'), db.listPublicShops()]).then(results => {
    if (!alive()) return;
    const types = results[0].status === 'fulfilled' ? results[0].value.map(item => item.name) : [];
    const sectors = results[1].status === 'fulfilled' ? results[1].value.map(item => item.sector) : [];
    for (const [id, choices] of [['shop-type-options', types], ['shop-sector-options', sectors]]) {
      app.querySelector('#' + id).innerHTML = [...new Set(choices.filter(Boolean))].map(value => `<option value="${escape(value)}"></option>`).join('');
    }
  });
  controls();
  return { requestLeave, dispose() { disposed = true; events.abort(); releasePreview(); } };
}
