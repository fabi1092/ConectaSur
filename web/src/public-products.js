
import { escapeHtml as escape, safeImageUrl, priceLabel } from './content.js';
import { icon } from './visuals.js';

export function photo(url, alt, extra = '') {
  const safe = safeImageUrl(url);
  return `<div class="catalog-photo ${extra}"><span class="photo-placeholder">${icon('shop')}<span>Imagen por agregar</span></span>${safe ? `<img data-photo src="${escape(safe)}" alt="${escape(alt)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
}

export function wirePhotos(root) {
  root.querySelectorAll('img[data-photo]').forEach(img => {
    const ready = () => {
      img.parentElement.classList.add('photo-ready');
    };
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    if (img.complete) {
      if (img.naturalWidth) ready();
      else img.remove();
    }
  });
}

export function availabilityText(product) {
  if (product?.soldOut) return 'Agotado · consulta a la tienda';
  if (product?.onRequest) return 'A pedido · hecho por encargo';
  return '';
}

export function isPublicProductVisible(product) {
  if (!product || product.visible === false) return false;
  if (product.stockMode === 'UNIQUE' && product.quantity === 0) return false;
  if (product.stockMode === 'UNITS' && product.quantity === 0 && !product.soldOut && !product.onRequest) return false;
  return true;
}

export function productCard(product, shop) {
  if (!isPublicProductVisible(product)) return '';
  const statusText = availabilityText(product);
  return `<article class="catalog-card"><button type="button" class="catalog-open" data-product="${escape(product.id)}" aria-label="Ver producto: ${escape(product.name)}">
    ${photo(product.photo, product.name)}
    <span class="catalog-content"><span class="catalog-category">${escape(product.category || 'Producto local')}</span><strong class="catalog-name">${escape(product.name)}</strong><span class="catalog-shop">${escape(shop?.name || 'Emprendimiento local')}</span><span class="catalog-bottom"><strong>${escape(priceLabel(product))}</strong><span class="catalog-arrow">${icon('arrow')}</span></span>${statusText ? `<span class="catalog-availability">${escape(statusText)}</span>` : ''}</span>
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
    const selectedVariant = variants.find(item => item.available !== false) || null;

    const displayedProduct = selectedVariant
      ? {
          ...product,
          priceClp: selectedVariant.priceClp ?? product.priceClp,
          variants: []
        }
      : product;

    const initialPrice = priceLabel(displayedProduct);
    const statusText = availabilityText(product);
    const unavailableVariantSuffix = product.onRequest ? ' · A pedido' : ' · Agotado';

    const variantSelector = variants.length
      ? `<section class="dialog-options">
          <h3>Opciones de este producto</h3>
          <label for="product-variant">Selecciona una opción</label>
          <select id="product-variant" data-variant-select aria-label="Seleccionar variante" ${selectedVariant ? '' : 'disabled'}>
            ${variants.map(item => `<option value="${escape(item.id)}" ${selectedVariant?.id === item.id ? 'selected' : ''} ${item.available === false ? 'disabled' : ''}>${escape(item.label)}${item.available === false ? unavailableVariantSuffix : ''}</option>`).join('')}
          </select>
        </section>`
      : '';

    dialog.innerHTML = `
      <button class="dialog-close" type="button">${icon('close')} Cerrar</button>
      <div class="product-dialog-layout">
        ${photo(selectedVariant?.photo || product.photo, product.name, 'dialog-photo')}
        <div class="dialog-content">
          <p class="public-eyebrow">${escape(product.category || 'Producto local')}</p>
          <h2>${escape(product.name)}</h2>
          <p class="dialog-price" aria-live="polite">${escape(initialPrice)}</p>
          ${statusText ? `<p class="catalog-availability" data-availability-status>${escape(statusText)}</p>` : ''}
          <p class="public-description">${escape(product.description || 'Consulta los detalles directamente con la tienda.')}</p>
          ${variantSelector}
          <p class="dialog-shop">De ${escape(shop?.name || 'un emprendimiento local')}</p>
          <a class="public-primary" href="#tienda/${escape(encodeURIComponent(product.shopId))}">Conocer la tienda ${icon('arrow')}</a>
          <p class="dialog-note">Consulta directamente por disponibilidad y entrega.</p>
        </div>
      </div>`;

    dialog.setAttribute('aria-label', product.name);

    const updateVoiceGuide = (variant = null) => {
      const currentProduct = variant
        ? {
            ...product,
            priceClp: variant.priceClp ?? product.priceClp,
            variants: []
          }
        : displayedProduct;

      dialog.dataset.voiceGuide =
        `${product.name}. ${priceLabel(currentProduct)}. ` +
        `${product.description || 'Consulta los detalles con la tienda.'} ` +
        `${variant ? `Opción seleccionada: ${variant.label}. ` : ''}` +
        `${product.soldOut ? 'Agotado. Consulta a la tienda.' : product.onRequest ? 'A pedido. Hecho por encargo.' : ''} ` +
        `De ${shop?.name || 'un emprendimiento local'}.`;
    };

    updateVoiceGuide(selectedVariant);

    const selector = dialog.querySelector('[data-variant-select]');

    if (selector) {
      selector.addEventListener('change', () => {
        const variant = variants.find(item =>
          String(item.id) === selector.value && item.available !== false
        );

        if (!variant) return;

        const currentProduct = {
          ...product,
          priceClp: variant.priceClp ?? product.priceClp,
          variants: []
        };

        dialog.querySelector('.dialog-price').textContent =
          priceLabel(currentProduct);

        const currentPhoto = variant.photo || product.photo;
        dialog.querySelector('.dialog-photo').outerHTML =
          photo(currentPhoto, `${product.name} - ${variant.label}`, 'dialog-photo');

        wirePhotos(dialog);
        updateVoiceGuide(variant);
      });
    }

    dialog.querySelector('.dialog-content').insertAdjacentHTML(
      'beforeend',
      `<div class="assistance-actions">
        <button type="button" data-listen>${icon('volume')}Escuchar producto</button>
        <button type="button" data-pause-reading hidden>Pausar lectura</button>
        <button type="button" data-stop-reading hidden>Detener lectura</button>
      </div>
      <p data-reading-status role="status"></p>`
    );

    root.closest('#app').append(dialog);

    dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('a').addEventListener('click', () => dialog.close());

    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const box = dialog.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        ) dialog.close();
      }
    });

    wirePhotos(dialog);
    dialog.showModal();
  }));
}
