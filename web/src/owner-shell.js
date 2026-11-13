import { escapeHtml as esc } from './content.js';
import { icon, brand } from './visuals.js';

const NAV_ITEMS = [
  { id: 'home', label: 'Resumen', symbol: 'grid' },
  { id: 'products', label: 'Mis productos', symbol: 'yarn' },
  { id: 'sales', label: 'Mis ventas', symbol: 'receipt' },
  { id: 'edit', label: 'Editar tienda', symbol: 'shop' }
];

export function ownerShell(shop, active, content) {
  const shopId = encodeURIComponent(shop?.id || '');
  return `<div class="dashboard owner-site">
    <a class="skip-link" href="#public-content">Ir al contenido</a>
    <aside class="sidebar owner-sidebar" aria-label="Menú de mi tienda">
      <a class="public-brand" href="#inicio" aria-label="ConectaSur, inicio">${brand()}</a>
      <p class="owner-sidebar-role">Panel emprendedora</p>
      <div class="owner-sidebar-shop">
        <strong>${esc(shop?.name || 'Mi tienda')}</strong>
        <span>${esc(shop?.sector || 'Tu espacio de ventas')}</span>
      </div>
      <nav aria-label="Secciones de mi tienda">
        ${NAV_ITEMS.map(item => `<button type="button" data-owner-nav="${item.id}"${active === item.id ? ' aria-current="page"' : ''}>${icon(item.symbol)}<span>${item.label}</span></button>`).join('')}
      </nav>
      <div class="owner-sidebar-footer">
        ${shopId ? `<a class="sidebar-public-link" href="#tienda/${shopId}">${icon('pin')}<span>Ver ficha pública</span></a>` : ''}
        <a class="sidebar-public-link" href="#inicio">${icon('grid')}<span>Explorar catálogo</span></a>
        <button type="button" class="owner-sidebar-logout" data-owner-logout>${icon('user')}<span>Cerrar sesión</span></button>
      </div>
    </aside>
    <main id="public-content" class="owner-main" tabindex="-1">
      ${content}
    </main>
  </div>`;
}

export function wireOwnerShell(app, { onNavigate, onLogout, signal } = {}) {
  app.querySelectorAll('[data-owner-nav]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-current') === 'page') return;
      onNavigate?.(button.dataset.ownerNav);
    }, signal ? { signal } : undefined);
  });
  app.querySelector('[data-owner-logout]')?.addEventListener('click', () => onLogout?.(), signal ? { signal } : undefined);
}

