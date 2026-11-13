import L from 'leaflet';

export const PUERTO_MONTT_CENTER = [-41.4693, -72.9424];

function pinIcon(label = '') {
  return L.divIcon({
    className: 'cs-map-pin-wrap',
    html: `<span class="cs-map-pin" aria-hidden="true"></span>${label ? `<span class="cs-map-pin-label">${label}</span>` : ''}`,
    iconSize: [28, 28],
    iconAnchor: [14, 28]
  });
}

export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function renderInteractiveMap(container, {
  lat = null,
  lng = null,
  zoom = 14,
  interactivePick = false,
  popupText = '',
  onPick = null
} = {}) {
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const center = hasCoords ? [Number(lat), Number(lng)] : PUERTO_MONTT_CENTER;
  const map = L.map(container, { scrollWheelZoom: false }).setView(center, hasCoords ? zoom : 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  let marker = null;
  function setPoint(nextLat, nextLng, text = popupText) {
    if (!Number.isFinite(Number(nextLat)) || !Number.isFinite(Number(nextLng))) return;
    const pos = [Number(nextLat), Number(nextLng)];
    if (!marker) {
      marker = L.marker(pos, { icon: pinIcon(), draggable: interactivePick }).addTo(map);
      if (interactivePick) {
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          onPick?.(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
        });
      }
    } else {
      marker.setLatLng(pos);
    }
    if (text) marker.bindPopup(text).openPopup();
    map.setView(pos, Math.max(map.getZoom(), 14));
  }

  if (hasCoords) {
    setPoint(lat, lng, popupText);
  }

  if (interactivePick) {
    map.on('click', event => {
      const nextLat = Number(event.latlng.lat.toFixed(6));
      const nextLng = Number(event.latlng.lng.toFixed(6));
      setPoint(nextLat, nextLng, '');
      onPick?.(nextLat, nextLng);
    });
  }

  requestAnimationFrame(() => map.invalidateSize());

  return {
    map,
    setPoint,
    destroy() {
      map.remove();
    }
  };
}

export async function searchAddressPuertoMontt(query) {
  const clean = String(query || '').trim();
  if (!clean) return [];
  const full = /puerto montt|alerce|los lagos/i.test(clean) ? clean : `${clean}, Puerto Montt, Chile`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=cl&q=${encodeURIComponent(full)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('No pudimos buscar la dirección en este momento.');
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map(r => ({
    label: r.display_name,
    lat: Number(Number(r.lat).toFixed(6)),
    lng: Number(Number(r.lon).toFixed(6))
  }));
}

