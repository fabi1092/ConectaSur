// Íconos de interfaz originales en SVG, siempre acompañados por texto en las acciones.
export function icon(name, extra = '') {
  const paths = {
    receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM8 7h8M8 11h8M8 15h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4ZM17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    microphone: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 7h6M12 11h9M12 15h8M12 19h5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 1-1 2-1 2M12 17h.01"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    shop: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0M9 20v-6h6v6"/>',
    heart: '<path d="m12 20-8-8C-2 5 7 0 12 7c5-7 14-2 8 5Z"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9 11 11 0 0 1-4-1l-5 2 1-5a9 9 0 1 1 17-5Z"/><path d="M8 9h8M8 13h5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m2 4a6 6 0 0 1 4 6"/>',
    tag: '<path d="m21 12-9 9L3 12V3h9Z"/><circle cx="7.5" cy="7.5" r="1"/>',
    exit: '<path d="M9 3H3v18h6m-1-9h13m-5-5 5 5-5 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    leaf: '<path d="M20 3C5 1 1 11 7 17c7 6 15-1 13-14ZM5 21 17 7"/>',
    yarn: '<circle cx="12" cy="11" r="8"/><path d="M6 6c3 0 8 4 11 10M4 11c4 0 6 2 9 7M12 3c-3 4-6 6-8 7M20 10c-4 0-6-2-8-6M16 18c1 5 5 5 6 1"/>',
    food: '<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 3c-5 4-5 10 0 10V3Zm0 10v8"/>'
  };
  return `<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shop}</svg>`;
}

// Mismo recurso original que Android, mostrado dentro de una ventana de CSS, sin editarlo.
export function brand() {
  return '<span class="brand-symbol" aria-hidden="true"><img src="/assets/conectasur-brand.jpg" alt="" width="1600" height="872"></span><span class="brand-word">Conecta<strong>Sur</strong></span>';
}
