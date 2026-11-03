import { escapeHtml as esc } from './content.js';
import { icon } from './visuals.js';
import { productSummary, dailySales } from '../dashboard-model.js';
import { pesos } from '../sales-model.js';
import './owner-dashboard.css';
const units=value=>`${value} ${BigInt(value)===1n ? 'unidad' : 'unidades'}`;
const date=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'medium',timeStyle:'short'});
export function dashboardMetrics() {
  return `<section class="owner-dashboard" aria-labelledby="owner-dashboard-title"><div class="owner-dashboard-heading"><div><h2 id="owner-dashboard-title">Tu resumen de hoy</h2><p>Ventas guardadas de hoy, con fecha y horario de Chile.</p></div><button type="button" class="dictation-action" data-dashboard-listen data-listen hidden>${icon('volume')}Escuchar resumen</button><button type="button" class="dictation-action" data-pause-reading hidden>Pausar lectura</button><button type="button" class="dictation-action" data-stop-reading hidden>Detener lectura</button></div><div class="owner-metrics">${[['products','Productos en tu catálogo','yarn'],['public','Productos en la vitrina','shop'],['sales','Ventas guardadas hoy','receipt'],['total','Total guardado hoy','clock']].map(([id,label,symbol])=>`<article class="owner-metric"><span class="owner-metric-label">${icon(symbol)}${label}</span><strong id="dashboard-${id}">—</strong><p id="dashboard-${id}-note">Consultando…</p></article>`).join('')}</div><p id="owner-dashboard-status" role="status">Cargando tu resumen…</p><p data-reading-status role="status"></p></section>`;
}
export function dashboardPanels() {
  return `<div class="owner-dashboard-panels"><section class="editor-card"><h2>Últimas ventas guardadas</h2><p class="editor-intro">Solo tú puedes ver esta información.</p><div id="dashboard-recent"><p>Buscando tus ventas…</p></div><button class="owner-secondary" type="button" data-dashboard-open="sales">${icon('receipt')}Ver mis ventas</button></section><section class="editor-card"><h2>Revisa la disponibilidad</h2><p class="editor-intro">Te ayudamos a mantener tu catálogo al día.</p><div id="dashboard-stock"><p>Revisando tus productos…</p></div><button class="owner-secondary" type="button" data-dashboard-open="products">${icon('yarn')}Revisar mis productos</button></section></div>`;
}
export async function loadDashboard(root,db,data,isCurrent) {
  const results=await Promise.allSettled([db.ownerCatalog(data.shop.id),db.listPublicProducts(data.shop.id),db.ownerSalesHistory(data.shop.id)]);
  if(!root.isConnected || !isCurrent())return;
  const set=(id,value,note)=>{root.querySelector('#dashboard-'+id).textContent=value;root.querySelector('#dashboard-'+id+'-note').textContent=note;};
  const [catalog,publicProducts,history]=results;
  const speech=['Este es tu resumen de tienda.'];
  if(catalog.status==='fulfilled') {
    const summary=productSummary(catalog.value.products);
    set('products',String(summary.total),'Incluye productos visibles y ocultos.');speech.push(`${summary.total} productos en tu catálogo.`);
    const stock=root.querySelector('#dashboard-stock');
    stock.innerHTML=`<div class="dashboard-stock-counts"><p><strong>${summary.empty.length}</strong> ${summary.empty.length===1 ? 'producto' : 'productos'} sin unidades</p><p><strong>${summary.low.length}</strong> ${summary.low.length===1 ? 'producto' : 'productos'} con 1 a 3 unidades</p></div>${summary.empty.length || summary.low.length ? `<ul>${[...summary.empty,...summary.low].slice(0,4).map(product=>`<li><strong>${esc(product.name)}</strong><span>${product.quantity===0 ? (product.soldOut==='ORDER' ? 'Sin unidades · recibe encargos' : 'Sin unidades') : `${units(product.quantity)} ${product.quantity===1 ? 'disponible' : 'disponibles'}`}</span></li>`).join('')}</ul>` : '<p>No tienes productos con pocas unidades.</p>'}<p class="editor-hint">Solo se cuentan productos por unidades o piezas únicas. Con tallas o colores, se usa el total del producto; revisa sus opciones en Mis productos.</p>`;
  } else {set('products','—','No pudimos consultar tu catálogo.');root.querySelector('#dashboard-stock').innerHTML='<p>No pudimos comprobar la disponibilidad. No significa que esté agotada.</p>';speech.push('No pudimos consultar los productos.');}
  if(publicProducts.status==='fulfilled'){set('public',String(publicProducts.value.length),'Los que pueden encontrar los visitantes.');speech.push(`${publicProducts.value.length} productos en la vitrina.`);}
  else {set('public','—','No pudimos comprobar la vitrina.');speech.push('No pudimos consultar la vitrina.');}
  if(history.status==='fulfilled') {
    const summary=dailySales(history.value.sales),enabled=history.value.shop.historyEnabled;
    set('sales',String(summary.count),`${units(summary.units)} en ventas guardadas hoy.`);set('total',pesos(summary.total),'Suma de las ventas guardadas hoy.');
    speech.push(`${summary.count} ventas guardadas hoy. ${units(summary.units)}. Total guardado hoy: ${summary.total} pesos chilenos.`);
    const recent=root.querySelector('#dashboard-recent');
    recent.innerHTML=`${!enabled ? '<p class="dashboard-history-warning">Tu historial está desactivado: las ventas nuevas actualizan unidades, pero no aparecen en este resumen. Puedes activarlo en Mis ventas.</p>' : '<p class="editor-hint">Solo incluye operaciones guardadas con el historial activado.</p>'}${summary.recent.length ? `<ol class="dashboard-recent-list">${summary.recent.map(sale=>`<li><div><strong>${esc(sale.product_name)}</strong><span>${esc(date.format(new Date(Number(sale.date_millis))))} · ${units(sale.quantity)}</span></div><strong>${esc(pesos(BigInt(sale.price_clp)*BigInt(sale.quantity)))}</strong></li>`).join('')}</ol>` : '<p class="dashboard-empty">Todavía no tienes ventas guardadas. Registra tu primera venta desde Mis ventas.</p>'}`;
    if(!enabled)speech.push('El historial está desactivado. Este resumen no incluye las ventas que no se guardaron.');
  }else{set('sales','—','No pudimos consultar las ventas.');set('total','—','No pudimos calcular el total.');root.querySelector('#dashboard-recent').innerHTML='<p>No pudimos cargar tus ventas. Usa Actualizar información para reintentar.</p>';speech.push('No pudimos consultar las ventas; no se muestra un total supuesto.');}
  const summary=root.querySelector('.owner-dashboard');summary.dataset.voiceGuide=speech.join(' ');summary.querySelector('[data-dashboard-listen]').hidden=false;
  root.querySelector('#owner-dashboard-status').textContent=results.some(result=>result.status==='rejected') ? 'Parte del resumen no se pudo cargar. Pulsa Actualizar información para volver a consultar.' : 'Resumen actualizado con la información de tu tienda.';
}
