export const SALE_COLUMNS = 'id,shop_id,product_id,product_name,variant_id,quantity,price_clp,place,date_millis';
export function saleCommand(value) {
  const fail=message=>{throw Object.assign(new Error(message),{code:'invalid_sale'});};
  if(!value || Object.keys(value).some(key=>!['requestId','productId','variantId','quantity','place'].includes(key)))fail('Hay datos de venta no permitidos.');
  if(typeof value.requestId!=='string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.requestId))fail('No pudimos identificar esta venta. Vuelve a abrir Mis ventas.');
  if(typeof value.productId!=='string' || !value.productId.trim() || value.productId.length>120)fail('Elige un producto.');
  if(value.variantId!==null && (typeof value.variantId!=='string' || !value.variantId.trim() || value.variantId.length>120))fail('Elige una talla, color u otra opción.');
  if(!(typeof value.quantity==='number' || (typeof value.quantity==='string' && /^\d+$/.test(value.quantity))) || !Number.isSafeInteger(Number(value.quantity)) || Number(value.quantity)<1 || Number(value.quantity)>2147483647)fail('Escribe una cantidad entera mayor que cero, sin puntos ni comas.');
  if(typeof value.place!=='string' || value.place.length>240)fail('El lugar puede tener hasta 240 caracteres.');
  return {...value,quantity:Number(value.quantity)};
}
export function saleMode(product) {
  return product.stockMode==='UNITS' && product.quantity===0 && product.soldOut==='ORDER' ? 'ON_REQUEST' : product.stockMode;
}
export function saleSelection(product,variantId,quantity) {
  if(!product)throw Object.assign(new Error('Elige un producto que esté en tu catálogo.'),{code:'invalid_sale'});
  const option=product.variants.find(value=>value.id===variantId);
  if(product.variants.length && !option)throw Object.assign(new Error('Elige una talla, color u otra opción.'),{code:'invalid_sale'});
  const mode=saleMode(product),available=['UNITS','UNIQUE'].includes(mode) ? (option?.quantity ?? product.quantity) : null;
  if(available!==null && quantity>available)throw Object.assign(new Error(`Quedan ${available} unidades disponibles. Revisa la cantidad.`),{code:'invalid_sale'});
  const unitPrice=option?.priceClp ?? product.priceClp;
  return {option,mode,available,unitPrice,total:BigInt(unitPrice)*BigInt(quantity)};
}
export const pesos=value=>new Intl.NumberFormat('es-CL').format(BigInt(value))+' pesos chilenos';
export const saleTotal=row=>BigInt(row.price_clp)*BigInt(row.quantity);
const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'});
export function chileDay(milliseconds) {
  const parts=Object.fromEntries(calendar.formatToParts(Number(milliseconds)).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const normalize=value=>String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
export function filterSales(rows,{from='',to='',product='',place=''}) {
  for(const value of [from,to])if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value))throw new Error('Revisa las fechas del filtro.');
  if(from && to && from>to)throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  return rows.filter(row=>{const day=chileDay(row.date_millis);return (!from || day>=from) && (!to || day<=to) && normalize(row.product_name).includes(normalize(product)) && normalize(row.place).includes(normalize(place));});
}
