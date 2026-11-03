export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function safeImageUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

export function priceLabel(product) {
  const variants = (product.variants || []).filter(variant => variant.available !== false);
  const prices = (variants.length ? variants.map(variant => variant.priceClp ?? product.priceClp) : [product.priceClp])
    .filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (!prices.length) return 'Consultar precio';
  const price = Math.min(...prices);
  const prefix = prices.some(value => value !== price) ? 'Desde ' : '';
  return prefix + new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(price) + ' CLP';
}

export function chileanSpeech(text) {
  return String(text ?? '').replace(/\$\s*([\d.,]+)(?:\s*CLP)?|([\d.,]+)\s*CLP\b/g,(_match,amount,clpAmount)=>{
    const digits=(amount || clpAmount).replace(/[.,]/g,'');
    return `${digits} ${digits === '1' ? 'peso chileno' : 'pesos chilenos'}`;
  });
}
