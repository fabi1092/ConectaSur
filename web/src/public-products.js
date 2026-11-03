import { escapeHtml as escape, safeImageUrl, priceLabel } from './content.js';
import { icon } from './visuals.js';

export function photo(url, alt, extra = '') {
  const safe = safeImageUrl(url);
  return `<div class="catalog-photo ${extra}"><span class="photo-placeholder">${icon('shop')}<span>Imagen por agregar</span></span>${safe ? `<img data-photo src="${escape(safe)}" alt="${escape(alt)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
}

export function wirePhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach(img => {
    const ready = () => { img.parentElement.classList.add('photo-ready'); };
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    if (img.complete) { if (img.naturalWidth) ready(); else img.remove(); }
  });
}

export function productCard(product, shop) {
  return `<article class="catalog-card"><button type="button" class="catalog-open" data-product="${escape(product.id)}" aria-label="Ver producto: ${escape(product.name)}">
    ${photo(product.photo, product.name)}
    <span class="catalog-content"><span class="catalog-category">${escape(product.category || 'Producto local')}</span><strong class="catalog-name">${escape(product.name)}</strong><span class="catalog-shop">${escape(shop?.name || 'Emprendimiento local')}</span><span class="catalog-bottom"><strong>${escape(priceLabel(product))}</strong><span class="catalog-arrow">${icon('arrow')}</span></span>${product.soldOut ? '<span class="catalog-availability">Agotado · consulta a la tienda</span>' : product.onRequest ? '<span class="catalog-availability">Hecho por encargo</span>' : ''}</span>
  </button></article>`;
}

export function wireProducts(root, products, shops) {
  wirePhotos(root);
  root.querySelectorAll('[data-product]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => item.id === button.dataset.product);
    if (!product) return;
    const shop = shops.find(item => item.id === product.shopId);
    root.closest('#app').querySelector('.product-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'product-dialog public-site';
    const variants = (product.variants || []).filter(item => item.label);
    dialog.innerHTML = `<button class="dialog-close" type="button">${icon('close')} Cerrar</button><div class="product-dialog-layout">${photo(product.photo, product.name, 'dialog-photo')}<div class="dialog-content"><p class="public-eyebrow">${escape(product.category || 'Producto local')}</p><h2>${escape(product.name)}</h2><p class="dialog-price">${escape(priceLabel(product))}</p><p class="public-description">${escape(product.description || 'Consulta los detalles directamente con la tienda.')}</p>${variants.length ? `<section class="dialog-options"><h3>Opciones de este producto</h3><ul>${variants.map(item => `<li>${escape(item.label)}${item.available === false ? ' · No disponible' : ''}</li>`).join('')}</ul></section>` : ''}<p class="dialog-shop">De ${escape(shop?.name || 'un emprendimiento local')}</p><a class="public-primary" href="#tienda/${escape(encodeURIComponent(product.shopId))}">Conocer la tienda ${icon('arrow')}</a><p class="dialog-note">Consulta directamente por disponibilidad y entrega.</p></div></div>`;
    dialog.setAttribute('aria-label', product.name);
    dialog.dataset.voiceGuide=`${product.name}. ${priceLabel(product)}. ${product.description || 'Consulta los detalles con la tienda.'} ${product.soldOut ? 'Agotado. Consulta a la tienda.' : product.onRequest ? 'Hecho por encargo.' : ''} ${variants.map(item=>`${item.label}${item.available === false ? ', no disponible' : ''}.`).join(' ')} De ${shop?.name || 'un emprendimiento local'}.`;
    dialog.querySelector('.dialog-content').insertAdjacentHTML('beforeend',`<div class="assistance-actions"><button type="button" data-listen>${icon('volume')}Escuchar producto</button><button type="button" data-pause-reading hidden>Pausar lectura</button><button type="button" data-stop-reading hidden>Detener lectura</button></div><p data-reading-status role="status"></p>`);
    root.closest('#app').append(dialog);
    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('a').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
    wirePhotos(dialog);
    dialog.showModal();
  }));
}
