export const OWNER_PRODUCT_COLUMNS = 'id,shop_id,name,description,category,product_type,attributes,price_clp,show_price,stock_mode,sold_out,quantity,visible,photo,variants,updated_at';
export const STOCK_MODES = { UNITS: 'Por unidades', UNIQUE: 'Pieza única', ON_REQUEST: 'Por encargo', UNLIMITED: 'Sin contar unidades' };
export const SOLD_OUT_MODES = { HIDE: 'Ocultar del catálogo', SHOW: 'Mostrar como agotado', ORDER: 'Seguir recibiendo encargos' };
export function privateProduct(row) {
  return { id: row.id, shopId: row.shop_id, name: row.name, description: row.description, category: row.category,
    productType: row.product_type, attributes: row.attributes || {}, priceClp: row.price_clp, showPrice: row.show_price,
    stockMode: row.stock_mode, soldOut: row.sold_out, quantity: row.quantity, visible: row.visible,
    photo: row.photo || '', variants: row.variants || [], updatedAt: row.updated_at };
}
function fail(message, field, step) { throw Object.assign(new Error(message), { code: 'invalid_product', field, step }); }
const imageUrl = value => { try { return new URL(value).protocol === 'https:' && value.length <= 2048; } catch { return false; } };
function text(value, max, field, required = false, step = 1) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`Revisa ${field}: ${required ? 'es obligatorio y admite' : 'admite'} hasta ${max} caracteres.`, field, step);
  return value.trim();
}
function integer(value, max, field, step) {
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) || !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > max) fail(`Revisa ${field}. Escribe un número entero, sin puntos ni comas.`, field, step);
  return Number(value);
}
export function normalizeProduct(input, shopId, { pendingPhoto = false, pendingVariants = new Set() } = {}) {
  const known = ['id','shopId','name','description','category','productType','attributes','priceClp','showPrice','stockMode','soldOut','quantity','visible','photo','variants','updatedAt'];
  if (Object.keys(input).some(key => !known.includes(key))) fail('Hay un campo de producto no permitido.', 'nombre', 1);
  if (input.shopId !== shopId) fail('Este producto no pertenece a tu tienda.', 'tienda', 1);
  if (!Object.hasOwn(STOCK_MODES, input.stockMode) || !Object.hasOwn(SOLD_OUT_MODES, input.soldOut)) fail('Elige una modalidad y qué hacer cuando se agote.', 'stock', 3);
  if (typeof input.visible !== 'boolean' || typeof input.showPrice !== 'boolean') fail('Revisa las opciones de publicación.', 'publicación', 3);
  if (!input.attributes || typeof input.attributes !== 'object' || Array.isArray(input.attributes) || new TextEncoder().encode(JSON.stringify(input.attributes)).length > 10000) fail('Los detalles del producto son demasiado extensos.', 'detalles', 1);
  if (!Array.isArray(input.variants) || input.variants.length > 100) fail('Se admiten hasta 100 variantes.', 'variantes', 2);
  if (input.stockMode === 'UNIQUE' && input.variants.length) fail('Una pieza única no admite variantes. Quita las variantes o elige otra modalidad.', 'variantes', 2);
  const countsStock = ['UNITS','UNIQUE'].includes(input.stockMode);
  const ids = new Set();
  const variants = input.variants.map(variant => {
    if (Object.keys(variant).some(key => !['id','label','quantity','priceClp','photo'].includes(key))) fail('Hay un campo de variante no permitido.', 'variantes', 2);
    const id = text(variant.id, 120, 'identificador de variante', true, 2);
    if (ids.has(id)) fail('Hay variantes con el mismo identificador.', 'variantes', 2);
    ids.add(id);
    const photo = variant.photo || null;
    if (photo && !imageUrl(photo) && !pendingVariants.has(id)) fail('Elige una foto válida para la variante.', 'variantes', 2);
    return { id, label: text(variant.label, 120, 'nombre de variante', true, 2),
      quantity: countsStock ? integer(variant.quantity, 2147483647, 'cantidad de variante', 2) : 0,
      priceClp: variant.priceClp === '' || variant.priceClp == null ? null : integer(variant.priceClp, 9007199254740991, 'precio de variante', 2), photo };
  });
  const quantity = countsStock ? (variants.length ? variants.reduce((sum, variant) => sum + variant.quantity, 0) : integer(input.quantity, input.stockMode === 'UNIQUE' ? 1 : 2147483647, 'cantidad', 3)) : null;
  if (quantity > 2147483647) fail('La cantidad total de variantes es demasiado grande.', 'cantidad', 2);
  const photo = input.photo || '';
  if (photo && !imageUrl(photo) && !pendingPhoto) fail('Elige una foto válida del producto.', 'foto', 0);
  if (input.visible && !imageUrl(photo) && !pendingPhoto) fail('Agrega una foto para publicar el producto, o desmarca la publicación para guardarlo oculto.', 'foto', 0);
  return { id: text(input.id, 120, 'identificador', true), shop_id: shopId, name: text(input.name, 120, 'nombre', true),
    description: text(input.description, 1000, 'descripción'), category: text(input.category, 120, 'categoría', true),
    product_type: text(input.productType, 120, 'tipo de producto', true), attributes: input.attributes,
    price_clp: integer(input.priceClp, 9007199254740991, 'precio', 1), show_price: input.showPrice,
    stock_mode: input.stockMode, sold_out: input.soldOut, quantity, visible: input.visible, photo, variants };
}
export function sameProduct(row, expected) {
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const businessFields = Object.fromEntries(Object.keys(expected).map(key => [key, row[key]]));
  return JSON.stringify(stable(businessFields)) === JSON.stringify(stable(expected));
}
