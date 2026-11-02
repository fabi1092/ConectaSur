// Las pantallas públicas reciben un repositorio; no acceden al SDK ni a tablas privadas.
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const shopLink = id => '#tienda/' + encodeURIComponent(id);
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');

function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function logo(shop, large = false) {
  const url = imageUrl(shop.logoUrl);
  return `<div class="shop-logo${large ? ' shop-logo-large' : ''}">
    <span class="shop-logo-fallback" aria-label="Sin logo">${escape(Array.from(shop.name || 'T')[0])}</span>
    ${url ? `<img src="${escape(url)}" alt="Logo de ${escape(shop.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
  </div>`;
}

function imageFallbacks(root) {
  root.querySelectorAll('.shop-logo img').forEach(img => {
    const ready = () => {
      img.previousElementSibling.hidden = true;
      img.classList.add('is-loaded');
    };
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    if (img.complete) {
      if (img.naturalWidth) ready();
      else img.remove();
    }
  });
}

function shell(content) {
  return `<div class="public-site">
    <a class="skip-link" href="#public-content">Ir al contenido</a>
    <header class="public-header">
      <a class="public-brand" href="#inicio" aria-label="ConectaSur, inicio">Conecta<span>Sur</span></a>
      <nav class="public-navigation" aria-label="Acceso a tu cuenta">
        <a class="public-owner-link" href="#ingresar">Ingresar <span aria-hidden="true">→</span></a>
      </nav>
    </header>
    <main id="public-content" tabindex="-1">${content}</main>
    <footer class="public-footer"><strong>ConectaSur</strong><span>Emprendimientos de Puerto Montt y Alerce · SurCode</span></footer>
  </div>`;
}

export { shell as publicShell, logo as shopLogo, imageFallbacks as wireShopImages, escape as escapeHtml };

function showStatus(app, title, message, retry) {
  app.innerHTML = shell(`<section class="public-state" aria-labelledby="state-title">
    <p class="public-eyebrow">Tiendas de nuestra comunidad</p>
    <h1 id="state-title" tabindex="-1">${escape(title)}</h1>
    <p role="status">${escape(message)}</p>
    ${retry ? '<button class="public-primary" id="public-retry">Intentar nuevamente</button>' : ''}
    <a class="public-text-link" href="#inicio">Volver a las tiendas</a>
  </section>`);
  app.querySelector('#state-title').focus({ preventScroll: true });
  if (retry) app.querySelector('#public-retry').addEventListener('click', retry);
}

function card(shop) {
  return `<article class="public-shop-card">
    <div class="public-card-heading">${logo(shop)}<span class="public-category">${escape(shop.entrepreneurType || 'Emprendimiento local')}</span></div>
    <h3><a href="${escape(shopLink(shop.id))}">${escape(shop.name)}</a></h3>
    <p class="public-sector"><span aria-hidden="true">⌖</span> ${escape(shop.sector || 'Sector por informar')}</p>
    <p class="public-card-description">${escape(shop.description || 'Conoce esta tienda y sus datos de contacto.')}</p>
    <a class="public-card-link" href="${escape(shopLink(shop.id))}" aria-label="Ver tienda: ${escape(shop.name)}">Ver tienda <span aria-hidden="true">→</span></a>
  </article>`;
}

export async function showPublicShops(app, db, isCurrent = () => true) {
  document.title = 'ConectaSur | Emprendimientos locales';
  app.innerHTML = shell(`<section class="public-hero" aria-labelledby="public-title">
    <p class="public-eyebrow">Hecho cerca de ti</p>
    <h1 id="public-title" tabindex="-1">Conoce los emprendimientos<br class="desktop-break"> de tu comunidad.</h1>
    <p>Descubre qué ofrecen las tiendas de Puerto Montt y Alerce, conoce su historia y encuentra cómo contactar.</p>
    <a class="public-primary" href="#tiendas">Conocer las tiendas <span aria-hidden="true">↓</span></a>
  </section>
  <section class="public-directory" id="tiendas" aria-labelledby="directory-title">
    <div class="public-directory-heading"><div><p class="public-eyebrow">Compra y conecta con lo local</p><h2 id="directory-title">Nuestras tiendas</h2></div>
      <p id="public-count" role="status">Cargando tiendas…</p></div>
    <form class="public-search" role="search">
      <label for="shop-search">Buscar una tienda</label>
      <div><input type="search" id="shop-search" placeholder="Nombre, tipo o sector" maxlength="160" autocomplete="off"><button class="public-primary" type="submit">Buscar</button></div>
    </form>
    <div id="public-results" class="public-shop-grid" aria-busy="true"><p role="status">Estamos buscando los emprendimientos.</p></div>
  </section>`);
  app.querySelector('#public-title').focus({ preventScroll: true });
  // El enlace interno no cambia de página ni dispara una segunda consulta.
  app.querySelector('a[href="#tiendas"]').addEventListener('click', event => {
    event.preventDefault();
    app.querySelector('#tiendas').scrollIntoView({ behavior: 'auto' });
    app.querySelector('#shop-search').focus({ preventScroll: true });
  });
  try {
    const shops = await db.listPublicShops();
    if (!isCurrent()) return;
    const results = app.querySelector('#public-results');
    const count = app.querySelector('#public-count');
    const input = app.querySelector('#shop-search');
    function filter() {
      const term = normalize(input.value.trim());
      const selected = shops.filter(shop => normalize([shop.name, shop.entrepreneurType, shop.sector].join(' ')).includes(term));
      count.textContent = `${selected.length} ${selected.length === 1 ? 'tienda' : 'tiendas'}`;
      results.setAttribute('aria-busy', 'false');
      results.innerHTML = selected.length ? selected.map(card).join('') : `<div class="public-empty"><h3>${shops.length ? 'No encontramos tiendas con esa búsqueda' : 'Pronto encontrarás tiendas aquí'}</h3><p>${shops.length ? 'Prueba con otro nombre, tipo o sector.' : 'Las tiendas aparecerán cuando estén disponibles.'}</p></div>`;
      imageFallbacks(results);
    }
    input.addEventListener('input', filter);
    app.querySelector('.public-search').addEventListener('submit', event => { event.preventDefault(); filter(); });
    filter();
  } catch {
    if (isCurrent()) showStatus(app, 'No pudimos cargar las tiendas', 'Revisa tu conexión y vuelve a intentarlo.', () => showPublicShops(app, db, isCurrent));
  }
}

function contactLink(contact) {
  const value = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return `<a class="public-primary" href="mailto:${escape(encodeURIComponent(value))}">Enviar correo <span aria-hidden="true">↗</span></a>`;
  }
  if (/^\+?[\d\s()-]{8,22}$/.test(value)) {
    return `<a class="public-primary" href="tel:${escape(value.replace(/[^+\d]/g, ''))}">Llamar a la tienda <span aria-hidden="true">↗</span></a>`;
  }
  const url = imageUrl(value);
  return url ? `<a class="public-primary" href="${escape(url)}" target="_blank" rel="noopener noreferrer">Abrir contacto <span aria-hidden="true">↗</span></a>` : '';
}

export async function showPublicShop(app, db, id, isCurrent = () => true) {
  document.title = 'ConectaSur | Tienda';
  app.innerHTML = shell('<section class="public-state"><p role="status">Cargando la tienda…</p></section>');
  try {
    const shop = id ? await db.getShop(id) : null;
    if (!isCurrent()) return;
    if (!shop) {
      showStatus(app, 'Esta tienda no está disponible', 'Puede que el enlace haya cambiado o que la tienda ya no esté activa. Puedes conocer otros emprendimientos.');
      return;
    }
    document.title = `${shop.name} | ConectaSur`;
    app.innerHTML = shell(`<div class="public-shop-page">
      <a class="public-back" href="#inicio">← Volver a las tiendas</a>
      <section class="public-shop-banner" aria-labelledby="shop-title">
        ${logo(shop, true)}
        <div><p class="public-eyebrow">Emprendimiento local</p><h1 id="shop-title" tabindex="-1">${escape(shop.name)}</h1>
          <p class="public-category">${escape(shop.entrepreneurType || 'Tipo por informar')}</p>
          <p class="public-sector"><span aria-hidden="true">⌖</span> ${escape(shop.sector || 'Sector por informar')}</p></div>
      </section>
      <div class="public-shop-details">
        <section class="public-about" aria-labelledby="about-title"><p class="public-eyebrow">Detrás de este emprendimiento</p><h2 id="about-title">Conoce nuestra tienda</h2><p class="public-description">${escape(shop.description || 'Esta tienda aún no ha agregado una descripción.')}</p></section>
        <section class="public-contact" aria-labelledby="contact-title"><p class="public-eyebrow">Conversemos</p><h2 id="contact-title">Contacta a la tienda</h2><p>Consulta directamente por sus productos y disponibilidad.</p>
          <dl><dt>Datos de contacto</dt><dd class="public-description">${escape(shop.contact || 'La tienda aún no ha agregado sus datos de contacto.')}</dd><dt>Sector</dt><dd>${escape(shop.sector || 'Por informar')}</dd></dl>
          ${shop.contact ? contactLink(shop.contact) : ''}
        </section>
      </div>
    </div>`);
    imageFallbacks(app);
    app.querySelector('#shop-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch {
    if (isCurrent()) showStatus(app, 'No pudimos cargar esta tienda', 'Revisa tu conexión y vuelve a intentarlo.', () => showPublicShop(app, db, id, isCurrent));
  }
}
