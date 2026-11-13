
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
  if (product?.stockMode === 'UNIQUE') return 'Pieza única disponible';
  return 'Disponible';
}

function availabilityTone(product) {
  if (product?.soldOut) return 'badge-soldout';
  if (product?.onRequest) return 'badge-order';
  if (product?.stockMode === 'UNIQUE') return 'badge-unique';
  return 'badge-available';
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
  const tone = availabilityTone(product);
  const variants = (product.variants || []).filter(v => v.label);
  const featuredVariant = variants.find(v => v.available !== false) || variants[0] || null;
  const cardPhoto = featuredVariant?.photo || product.photo;
  const variantCount = variants.length;
  return `<article class="catalog-card"><button type="button" class="catalog-open" data-product="${escape(product.id)}" aria-label="Ver producto: ${escape(product.name)}">
    ${photo(cardPhoto, product.name)}
    <span class="catalog-content">
      <span class="catalog-meta-row"><span class="catalog-category">${escape(product.category || 'Producto local')}</span><span class="catalog-badge ${tone}">${escape(statusText.split(' · ')[0])}</span></span>
      <strong class="catalog-name">${escape(product.name)}</strong>
      <span class="catalog-shop">${escape(shop?.name || 'Emprendimiento local')}${variantCount > 1 ? ` · ${variantCount} opciones` : ''}</span>
      <span class="catalog-bottom"><strong class="catalog-price-ml">${escape(priceLabel(product))}</strong><span class="catalog-arrow">${icon('arrow')}</span></span>
    </span>
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
    const selectedVariant = variants.find(item => item.available !== false) || variants[0] || null;

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
          <div class="variant-chips public-variant-chips" role="radiogroup" aria-label="Opciones de este producto">
            ${variants.map(item => {
              const optionProduct = { ...product, priceClp: item.priceClp ?? product.priceClp, variants: [] };
              const thumb = safeImageUrl(item.photo || product.photo);
              const isSelected = selectedVariant?.id === item.id;
              return `<button type="button" class="variant-chip" role="radio" data-variant-id="${escape(item.id)}" aria-checked="${isSelected}" tabindex="${isSelected ? '0' : '-1'}">
                ${thumb ? `<img class="variant-chip-thumb" src="${escape(thumb)}" alt="">` : `<span class="variant-chip-thumb variant-chip-empty">${icon('grid')}</span>`}
                <span class="variant-chip-info">
                  <strong>${escape(item.label)}</strong>
                  <small>${escape(priceLabel(optionProduct))}${item.available === false ? unavailableVariantSuffix : ''}</small>
                </span>
              </button>`;
            }).join('')}
          </div>
        </section>`
      : '';

    const attrs = Object.entries(product.attributes || {}).filter(([, val]) => String(val ?? '').trim() !== '');
    const specsBlock = attrs.length
      ? `<section class="dialog-specs" aria-label="Características del producto">
          <h3>Características del producto</h3>
          <dl class="specs-list">
            ${attrs.map(([k, v]) => `<div class="spec-row"><dt>${escape(k.replaceAll('_', ' '))}</dt><dd>${escape(v)}</dd></div>`).join('')}
          </dl>
        </section>`
      : '';

    dialog.innerHTML = `
      <button class="dialog-close" type="button">${icon('close')} Cerrar</button>
      <div class="product-dialog-layout">
        ${photo(selectedVariant?.photo || product.photo, product.name, 'dialog-photo')}
        <div class="dialog-content">
          <div class="dialog-badges">
            <span class="catalog-category">${escape(product.category || 'Producto local')}</span>
            <span class="catalog-badge ${availabilityTone(product)}" data-availability-status>${escape(statusText)}</span>
          </div>
          <h2>${escape(product.name)}</h2>
          <p class="dialog-price" aria-live="polite">${escape(initialPrice)}</p>
          ${variantSelector}
          <p class="public-description">${escape(product.description || 'Consulta los detalles directamente con la tienda.')}</p>
          ${specsBlock}
          <p class="dialog-shop">Vendido por <strong>${escape(shop?.name || 'un emprendimiento local')}</strong></p>
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

    const variantButtons = [...dialog.querySelectorAll('[data-variant-id]')];
    const selectVariantButton = button => {
      const variant = variants.find(item => String(item.id) === button.dataset.variantId);
      if (!variant) return;
      variantButtons.forEach(btn => {
        const active = btn === button;
        btn.setAttribute('aria-checked', String(active));
        btn.tabIndex = active ? 0 : -1;
      });

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
    };

    variantButtons.forEach((button, index) => {
      button.addEventListener('click', () => selectVariantButton(button));
      button.addEventListener('keydown', event => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
        const next = variantButtons[(index + delta + variantButtons.length) % variantButtons.length];
        next.focus();
        selectVariantButton(next);
      });
    });

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
