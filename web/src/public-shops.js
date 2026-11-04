// Las pantallas públicas reciben un repositorio; no acceden al SDK ni a tablas privadas.
import { escapeHtml as escape, safeImageUrl as imageUrl } from './content.js';
import { icon, brand } from './visuals.js';
import { accountDestination } from './account-navigation.js';
import { photo, wirePhotos, productCard, wireProducts } from './public-products.js';

const shopLink = id => '#tienda/' + encodeURIComponent(id);
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');

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

function shell(content, { showAccountLink = true, accountLocation = 'Estás en tu tienda' } = {}) {
  const account=accountDestination();
  return `<div class="public-site">
    <a class="skip-link" href="#public-content">Ir al contenido</a>
    <div class="community-strip">${icon('pin')} Puerto Montt y Alerce <span>Un lugar para conectar con lo nuestro.</span></div>
    <header class="public-header">
      <a class="public-brand" href="#inicio" aria-label="ConectaSur, inicio">${brand()}</a>
      <nav class="public-main-links" aria-label="Explorar ConectaSur"><a href="#inicio"${['','#inicio'].includes(location.hash) ? ' aria-current="page"' : ''}>Inicio</a><a href="#productos" data-section-link${location.hash === '#productos' ? ' aria-current="page"' : ''}>Productos</a><a href="#tiendas" data-section-link${location.hash === '#tiendas' ? ' aria-current="page"' : ''}>Tiendas locales</a></nav>
      ${showAccountLink ? `<nav class="public-navigation" aria-label="Acceso a tu cuenta">
        <a class="public-owner-link" data-account-link href="${account.href}">${icon('user')} <span data-account-label>${account.label}</span></a>
      </nav>` : ''}
    </header>
    <main id="public-content" tabindex="-1">${content}</main>
    <footer class="public-footer"><div class="footer-intro"><a class="public-brand" href="#inicio" aria-label="ConectaSur, inicio">${brand()}</a><p>Ideas, oficios y emprendimientos.<br>El sur tiene mucho que compartir.</p></div><div><strong>Conoce lo local</strong><a href="#productos" data-section-link>Explorar productos</a><a href="#tiendas" data-section-link>Conocer las tiendas</a></div><div><strong>Tu espacio</strong>${showAccountLink ? `<a data-account-link data-account-footer href="${account.href}"><span data-account-label>${account.footer}</span></a>` : `<span>${escape(accountLocation)}</span>`}<span>Puerto Montt · Alerce</span></div><div class="footer-bottom"><span>ConectaSur · Un proyecto de SurCode</span><span>Conectando nuestra comunidad.</span></div></footer>
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

function card(shop, products = []) {
  const cover = products.find(item => item.shopId === shop.id && imageUrl(item.photo));
  return `<article class="public-shop-card">
    ${cover ? photo(cover.photo, `Productos de ${shop.name}`, 'shop-cover') : `<div class="shop-cover shop-cover-empty">${icon('shop')}<span>Emprendimiento de nuestra comunidad</span></div>`}
    <div class="public-shop-card-body">
    <div class="public-card-heading">${logo(shop)}<span class="public-category">${escape(shop.entrepreneurType || 'Emprendimiento local')}</span></div>
    <h3><a href="${escape(shopLink(shop.id))}">${escape(shop.name)}</a></h3>
    <p class="public-sector">${icon('pin')} ${escape(shop.sector || 'Sector por informar')}</p>
    <p class="public-card-description">${escape(shop.description || 'Conoce esta tienda y sus datos de contacto.')}</p>
    <a class="public-card-link" href="${escape(shopLink(shop.id))}" aria-label="Ver tienda: ${escape(shop.name)}">Ver tienda ${icon('arrow')}</a>
  </div></article>`;
}

export async function showPublicShops(app, db, isCurrent = () => true) {
  document.title = 'ConectaSur | Emprendimientos locales';
  app.innerHTML = shell(`<section class="public-hero" aria-labelledby="public-title">
    <div class="hero-copy"><p class="public-eyebrow"><span class="eyebrow-line"></span> De nuestra comunidad para ti</p>
    <h1 id="public-title" tabindex="-1">Lo que buscas,<br><em>hecho cerca de ti.</em></h1>
    <p>Encuentra creaciones con historia. Descubre productos locales y conecta con los emprendimientos de Puerto Montt y Alerce.</p>
    <div class="hero-actions"><a class="public-primary" href="#productos" data-section-link>Explorar productos ${icon('arrow')}</a><a class="public-text-link" href="#tiendas" data-section-link>Conocer tiendas</a></div>
    <p class="hero-caption">${icon('pin')} El talento de nuestro sur, a un clic de distancia.</p></div>
    <div class="hero-visual"><figure class="hero-main-photo"><img src="/assets/artesanias-alerce.jpg" alt="Flores tejidas, tejidos y accesorios de las emprendedoras de Alerce" width="899" height="1599" fetchpriority="high"><figcaption>Creaciones que nacen en Alerce</figcaption></figure><figure class="hero-small-photo"><img src="/assets/creaciones-alerce.jpg" alt="Bandejas decoradas y bolsos tejidos fotografiados en la visita" width="1599" height="899"><figcaption>Detalles hechos con dedicación ${icon('heart')}</figcaption></figure><span class="hero-photo-label">Fotografías de nuestra visita a terreno</span></div>
  </section>
  <div class="community-values"><div>${icon('shop')}<span><strong>Emprendimientos locales</strong><small>Conoce lo que se crea cerca de ti.</small></span></div><div>${icon('chat')}<span><strong>Contacto directo</strong><small>Conversa con cada tienda.</small></span></div><div>${icon('heart')}<span><strong>Explora a tu ritmo</strong><small>Descubre productos sin crear una cuenta.</small></span></div></div>
  <section id="productos" class="public-products-section" aria-labelledby="products-title"><div class="section-title-row"><div><p class="public-eyebrow">Pequeños hallazgos, grandes historias</p><h2 id="products-title" tabindex="-1">Encuentra algo especial</h2></div><p>Productos de nuestras tiendas</p></div><div class="catalog-discovery"><div class="product-search" role="search" aria-label="Buscar productos"><label for="product-search">¿Qué estás buscando?</label><div>${icon('search')}<input id="product-search" type="search" placeholder="Por ejemplo: tejidos o bandejas" maxlength="160" autocomplete="off" disabled></div></div><p id="catalog-count" role="status"></p></div><div id="catalog-filters" class="catalog-filters" aria-label="Categorías de productos"></div><div id="catalog-results" class="catalog-grid" aria-busy="true"><p role="status">Cargando productos…</p></div></section>
  <section class="public-directory" id="tiendas" aria-labelledby="directory-title">
    <div class="public-directory-heading"><div><p class="public-eyebrow">Compra y conecta con lo local</p><h2 id="directory-title">Nuestras tiendas</h2></div>
      <p id="public-count" role="status">Cargando tiendas…</p></div>
    <form class="public-search" role="search">
      <label for="shop-search">Buscar una tienda</label>
      <div><input type="search" id="shop-search" placeholder="Nombre, tipo o sector" maxlength="160" autocomplete="off"><button class="public-primary" type="submit">Buscar</button></div>
    </form>
    <div id="public-results" class="public-shop-grid" aria-busy="true"><p role="status">Estamos buscando los emprendimientos.</p></div>
  </section>
  <section class="local-story"><div class="local-story-photo"><img src="/assets/creaciones-alerce.jpg" alt="Creaciones de las emprendedoras durante la visita a Alerce" loading="lazy" width="1599" height="899"></div><div><p class="public-eyebrow">Detrás de cada creación, una persona</p><h2>Conoce las manos<br>que le dan vida.</h2><p>Cada emprendimiento tiene algo que contar. En ConectaSur acercamos sus productos, oficios e ideas a nuestra comunidad.</p><a class="public-text-link" href="#tiendas" data-section-link>Descubrir las tiendas ${icon('arrow')}</a></div></section>`);
  app.querySelector('#public-title').focus({ preventScroll: true });
  app.querySelector('.public-search').addEventListener('submit', event => event.preventDefault());
  try {
    const shops = await db.listPublicShops();
    if (!isCurrent()) return;
    const results = app.querySelector('#public-results');
    const count = app.querySelector('#public-count');
    const input = app.querySelector('#shop-search');
    let products = [];
    function filter() {
      const term = normalize(input.value.trim());
      const selected = shops.filter(shop => normalize([shop.name, shop.entrepreneurType, shop.sector].join(' ')).includes(term));
      count.textContent = `${selected.length} ${selected.length === 1 ? 'tienda' : 'tiendas'}`;
      results.setAttribute('aria-busy', 'false');
      results.innerHTML = selected.length ? selected.map(shop => card(shop, products)).join('') : `<div class="public-empty"><h3>${shops.length ? 'No encontramos tiendas con esa búsqueda' : 'Pronto encontrarás tiendas aquí'}</h3><p>${shops.length ? 'Prueba con otro nombre, tipo o sector.' : 'Las tiendas aparecerán cuando estén disponibles.'}</p></div>`;
      imageFallbacks(results);
      wirePhotos(results);
    }
    input.addEventListener('input', filter);
    app.querySelector('.public-search').addEventListener('submit', event => { event.preventDefault(); filter(); });
    filter();
    const catalog = app.querySelector('#catalog-results');
    const filters = app.querySelector('#catalog-filters');
    try {
      products = (await db.listPublicProducts()).filter(product => shops.some(shop => shop.id === product.shopId));
      if (!isCurrent()) return;
      const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
      filters.innerHTML = [{ label: 'Todos', value: '' }, ...categories.map(value => ({ label: value, value }))].map((category, index) => `<button type="button" data-category="${escape(category.value)}" aria-pressed="${index === 0}">${icon(category.value === 'Artesanías' ? 'yarn' : category.value === 'Alimentos' ? 'food' : category.value === 'Plantas' ? 'leaf' : 'grid')}${escape(category.label)}</button>`).join('');
      const productSearch = app.querySelector('#product-search');
      let selectedCategory = '';
      function selectCategory(category = selectedCategory) {
        selectedCategory = category;
        const term = normalize(productSearch.value.trim());
        const selected = products.filter(product => (!category || product.category === category) && normalize([product.name,product.description,product.category,shops.find(shop => shop.id === product.shopId)?.name].join(' ')).includes(term));
        catalog.setAttribute('aria-busy', 'false');
        app.querySelector('#catalog-count').textContent = `${selected.length} ${selected.length === 1 ? 'producto para descubrir' : 'productos para descubrir'}`;
        catalog.innerHTML = selected.length ? selected.map(product => productCard(product, shops.find(shop => shop.id === product.shopId))).join('') : products.length ? '<div class="public-empty"><h3>No encontramos productos con esa búsqueda</h3><p>Prueba con otra palabra o elige la categoría Todos.</p></div>' : '<div class="public-empty"><h3>Pronto habrá productos para descubrir</h3><p>Mientras tanto, conoce las tiendas y consulta directamente lo que ofrecen.</p></div>';
        filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
        wireProducts(catalog, selected, shops);
      }
      filters.querySelectorAll('button').forEach(button => button.addEventListener('click', () => selectCategory(button.dataset.category)));
      productSearch.disabled = false;
      productSearch.addEventListener('input', () => selectCategory());
      selectCategory();
      filter();
    } catch {
      if (isCurrent()) { catalog.setAttribute('aria-busy', 'false'); catalog.innerHTML = '<div class="public-empty"><h3>No pudimos cargar los productos</h3><p>Puedes conocer las tiendas o volver a cargar la página para intentarlo de nuevo.</p></div>'; }
    }
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
          <p class="public-sector">${icon('pin')} ${escape(shop.sector || 'Sector por informar')}</p></div>
      </section>
      <div class="public-shop-details">
        <section class="public-about" aria-labelledby="about-title"><p class="public-eyebrow">Detrás de este emprendimiento</p><h2 id="about-title">Conoce nuestra tienda</h2><p class="public-description">${escape(shop.description || 'Esta tienda aún no ha agregado una descripción.')}</p></section>
        <section class="public-contact" aria-labelledby="contact-title"><p class="public-eyebrow">Conversemos</p><h2 id="contact-title">Contacta a la tienda</h2><p>Consulta directamente por sus productos y disponibilidad.</p>
          <dl><dt>Datos de contacto</dt><dd class="public-description">${escape(shop.contact || 'La tienda aún no ha agregado sus datos de contacto.')}</dd><dt>Sector</dt><dd>${escape(shop.sector || 'Por informar')}</dd></dl>
          ${shop.contact ? contactLink(shop.contact) : ''}
        </section>
      </div>
      <section class="shop-catalog" aria-labelledby="shop-products-title"><div class="section-title-row"><div><p class="public-eyebrow">Descubre sus creaciones</p><h2 id="shop-products-title">Productos de esta tienda</h2></div></div><div id="shop-catalog-results" class="catalog-grid" aria-busy="true"><p role="status">Cargando productos…</p></div></section>
    </div>`);
    imageFallbacks(app);
    app.querySelector('#shop-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
    try {
      const products = await db.listPublicProducts(shop.id);
      if (!isCurrent()) return;
      const gallery = app.querySelector('#shop-catalog-results');
      gallery.setAttribute('aria-busy', 'false');
      gallery.innerHTML = products.length ? products.map(product => productCard(product, shop)).join('') : '<div class="public-empty"><p>Esta tienda aún no ha publicado productos. Puedes contactarla para conocer lo que ofrece.</p></div>';
      wireProducts(gallery, products, [shop]);
    } catch {
      if (isCurrent()) { const gallery = app.querySelector('#shop-catalog-results'); gallery.setAttribute('aria-busy','false'); gallery.innerHTML = '<p role="status">No pudimos cargar los productos. Los datos de contacto de la tienda siguen disponibles arriba.</p>'; }
    }
  } catch {
    if (isCurrent()) showStatus(app, 'No pudimos cargar esta tienda', 'Revisa tu conexión y vuelve a intentarlo.', () => showPublicShop(app, db, id, isCurrent));
  }
}
