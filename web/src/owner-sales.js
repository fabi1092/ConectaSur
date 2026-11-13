import { escapeHtml as esc } from './public-shops.js';
import { ownerShell, wireOwnerShell } from './owner-shell.js';
import { icon } from './visuals.js';
import { safeImageUrl } from './content.js';
import { saleCommand, saleSelection, saleMode, pesos, saleTotal, filterSales } from '../sales-model.js';
import { STOCK_MODES } from '../product-model.js';
import './owner-sales.css';

const dateFormat=new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'medium',timeStyle:'short'});
const listen=`<button type="button" class="dictation-action" data-listen>${icon('volume')}Escuchar</button><button type="button" class="dictation-action" data-pause-reading hidden>Pausar lectura</button><button type="button" class="dictation-action" data-stop-reading hidden>Detener lectura</button><p data-reading-status role="status"></p>`;
const initialForm=()=>({productId:'',variantId:null,quantity:'1',place:''});
export function showOwnerSales(app,db,home,{isCurrent,onBack,onNavigate,onLogout}) {
  const shopId=home.shop.id,events=new AbortController(),key=`conectasur-sale-pending-v1:${home.user.uid}:${shopId}`;
  let disposed=false,busy=false,version=0,data=null,view='sale',form=initialForm(),pending=null,pendingRead=false,lastSuccess='';
  let records=[],filters={from:'',to:'',product:'',place:''},page=0;
  const alive=()=>!disposed && isCurrent();
  const dirty=()=>form.productId!=='' || form.quantity!=='1' || form.place!=='';
  function status(message,error=false){const node=app.querySelector('#sales-status');if(node){node.textContent=message;node.className=`owner-status${error ? ' owner-error' : ''}`;node.setAttribute('role',error ? 'alert' : 'status');}}
  function requestLeave(){
    if(busy){status('Estamos confirmando la operación. Espera el resultado antes de salir.');return false;}
    if(pending)return confirm('Hay una venta sin confirmación. No la registres como otra venta. Al volver a Mis ventas en esta misma pestaña podrás reintentar sin duplicarla. ¿Quieres salir de esta pantalla?');
    return !dirty() || confirm('¿Salir sin registrar los datos de esta venta?');
  }
  function shell(content,title){
    document.title=`${title} | ConectaSur`;
    app.innerHTML=ownerShell(home.shop,'sales',`<section class="owner-sales-page"><div class="editor-heading"><div><p class="public-eyebrow">${esc(home.shop.name)} · Mis ventas</p><h1 tabindex="-1">${title}</h1><p>Solo tú puedes consultar las ventas de tu tienda.</p></div><button type="button" class="owner-secondary" data-sale-action="back">Volver a Resumen</button></div>${lastSuccess ? `<p class="owner-save-success" role="status">${esc(lastSuccess)}</p>` : ''}<nav class="sales-tabs" aria-label="Mis ventas"><button type="button" class="owner-secondary" data-sale-action="sale" aria-pressed="${view==='sale'}">${icon('receipt')}Registrar una venta</button><button type="button" class="owner-secondary" data-sale-action="history" aria-pressed="${view==='history'}">${icon('clock')}Historial de ventas</button></nav>${content}<p id="sales-status" class="owner-status" role="status"></p></section>`);
    wireOwnerShell(app,{
      onNavigate:target=>{if(requestLeave())(onNavigate ? onNavigate(target) : onBack());},
      onLogout:()=>{if(requestLeave())onLogout?.();}
    });
    app.querySelector('h1').focus({preventScroll:true});window.scrollTo(0,0);
  }
  function lock(){busy=true;app.querySelectorAll('button,input,select,fieldset').forEach(node=>{node.disabled=true;});}
  function readPending(){
    if(pendingRead)return;
    const stored=sessionStorage.getItem(key);
    if(stored){const value=JSON.parse(stored);if(value.uid!==home.user.uid || value.shopId!==shopId)throw new Error('La venta pendiente no corresponde a esta cuenta.');saleCommand(value.command);pending=value;form={...value.command,quantity:String(value.command.quantity)};}
    pendingRead=true;
  }
  function clearPending(){sessionStorage.removeItem(key);pending=null;}
  async function load(nextView=view,notice=''){
    const current=++version;view=nextView;
    shell('<p role="status">Buscando la información de tu tienda…</p>',view==='sale' ? 'Registra lo que vendiste.' : 'Tu historial de ventas.');
    try{
      const catalog=await db.ownerCatalog(shopId);
      if(!alive() || current!==version)return;
      if(catalog.user.uid!==home.user.uid)throw new Error('La cuenta cambió. Vuelve a ingresar.');
      data=catalog;readPending();
      if(view==='history'){
        const history=await db.ownerSalesHistory(shopId);if(!alive() || current!==version)return;
        data.shop=history.shop;records=history.sales;renderHistory(notice);
      }else renderSale(notice);
    }catch(error){
      if(!alive() || current!==version)return;
      shell(`<div class="editor-card"><h2>No pudimos cargar ${view==='history' ? 'el historial' : 'tus productos'}.</h2><p>${pendingRead ? 'Revisa tu conexión y vuelve a intentarlo.' : 'No pudimos comprobar si hay una venta pendiente. Evita repetir una venta sin revisar su confirmación.'}</p><button class="public-primary" type="button" data-sale-action="refresh">Intentar nuevamente</button></div>`,view==='sale' ? 'Registra lo que vendiste.' : 'Tu historial de ventas.');
    }
  }
  function renderSale(notice='',error=false){
    view='sale';const frozen=!!pending,command=pending?.command || form;
    const options=data.products.map(product=>`<option value="${esc(product.id)}" ${product.id===command.productId ? 'selected' : ''}>${esc(product.name)}</option>`).join('');
    const missing=frozen && !data.products.some(product=>product.id===command.productId);
    shell(`<div class="sales-layout"><section class="editor-card" data-voice-guide="${esc(frozen ? 'Hay una venta sin respuesta confirmada. Conservamos sus datos en esta pestaña. Pulsa Reintentar confirmación para conocer el resultado sin duplicarla. Puedes consultar el historial antes de continuar.' : 'Elige el producto que vendiste, su talla o color si corresponde, la cantidad y el lugar. Revisa el resumen antes de confirmar. El servidor actualiza las unidades disponibles.')}" aria-labelledby="sale-form-title"><h2 id="sale-form-title">${frozen ? 'Venta por confirmar' : '¿Qué vendiste?'}</h2>${listen}${frozen ? '<p class="sales-notice" role="alert">No tenemos respuesta confirmada. Conservamos los datos: reintenta esta misma venta. Mantén abierta esta pestaña hasta resolverla.</p>' : ''}<form id="sale-form" novalidate><fieldset id="sale-fields" ${frozen ? 'disabled' : ''}><legend class="visually-hidden">Datos de la venta</legend><label for="sale-product">Producto vendido</label><select id="sale-product" required><option value="">Elige un producto</option>${missing ? `<option selected value="${esc(command.productId)}">${esc(pending.summary.productName)} · venta por confirmar</option>` : ''}${options}</select><div id="sale-variant-group" hidden><label id="sale-variant-label">Talla, color u otra opción</label><div id="sale-variant-chips" class="variant-chips" role="group" aria-labelledby="sale-variant-label"></div></div><label for="sale-quantity">Cantidad vendida</label><div class="quantity-stepper"><button type="button" class="owner-secondary stepper-btn" data-sale-action="qty-minus" aria-label="Disminuir cantidad" ${frozen ? 'disabled' : ''}>−</button><input id="sale-quantity" type="text" inputmode="numeric" pattern="[0-9]+" value="${esc(command.quantity)}" required aria-describedby="sale-availability"><button type="button" class="owner-secondary stepper-btn" data-sale-action="qty-plus" aria-label="Aumentar cantidad" ${frozen ? 'disabled' : ''}>+</button></div><p id="sale-availability" class="editor-hint"></p><label for="sale-place">Lugar de la venta (opcional)</label><input id="sale-place" maxlength="240" value="${esc(command.place)}" placeholder="Ejemplo: feria de Alerce"><p class="editor-hint">Puedes escribir la feria, tu tienda u otro lugar.</p></fieldset><button type="submit" class="public-primary">${frozen ? 'Reintentar confirmación' : 'Revisar venta'}</button></form><button type="button" class="owner-secondary" data-sale-action="refresh">Actualizar productos</button></section><aside><div id="sale-product-info" class="editor-card sales-product-info"></div><div class="editor-card sales-private"><h2>${icon('user')}Tu información es privada</h2><p>El comprador y el administrador no pueden consultar tu historial.</p><p id="sale-history-state">${data.shop.historyEnabled ? 'El historial está activado: las nuevas ventas guardan su detalle.' : 'El historial está desactivado: las ventas actualizan las unidades, pero no guardan un detalle nuevo.'}</p></div></aside></div>`, 'Registra lo que vendiste.');
    fillVariants();updatePreview();
    if(!data.products.length && !frozen){app.querySelector('#sale-form button').disabled=true;notice='Primero agrega un producto desde Mi tienda → Mis productos.';}
    status(notice,error);
  }
  function selectedProduct(){return data.products.find(product=>product.id===(pending?.command || form).productId);}
  function fillVariants(){
    const product=selectedProduct(),command=pending?.command || form,group=app.querySelector('#sale-variant-group'),chips=app.querySelector('#sale-variant-chips');
    const variants=product?.variants || [];
    group.hidden=!variants.length && !(pending && command.variantId);
    if(!pending && variants.length && !variants.some(option=>option.id===form.variantId)){
      form.variantId=variants[0].id;
    }
    const activeVariantId=(pending?.command || form).variantId;
    const counted=product ? ['UNITS','UNIQUE'].includes(saleMode(product)) : false;
    const list=variants.length ? variants : (pending && command.variantId ? [{id:command.variantId,label:pending.summary.variantLabel || 'Opción de esta venta',priceClp:pending.summary.unitPrice,quantity:command.quantity,photo:null}] : []);
    chips.innerHTML=list.map(option=>{
      const price=option.priceClp ?? product?.priceClp ?? 0;
      const thumb=safeImageUrl(option.photo || product?.photo);
      const stock=counted ? `${option.quantity ?? 0} ${(option.quantity ?? 0)===1 ? 'ud.' : 'uds.'}` : '';
      const selected=option.id===activeVariantId;
      return `<button type="button" class="variant-chip" data-sale-variant="${esc(option.id)}" aria-pressed="${selected}"${pending ? ' disabled' : ''}>${thumb ? `<img class="variant-chip-thumb" src="${esc(thumb)}" alt="">` : `<span class="variant-chip-thumb variant-chip-empty">${icon('grid')}</span>`}<span class="variant-chip-info"><strong>${esc(option.label)}</strong><small>${esc(pesos(price))}${stock ? ` · ${stock}` : ''}</small></span></button>`;
    }).join('');
    chips.querySelectorAll('img').forEach(img=>{img.onerror=()=>img.remove();});
  }
  function updatePreview(){
    const command=pending?.command || form,product=selectedProduct(),option=product?.variants.find(value=>value.id===command.variantId);
    const box=app.querySelector('#sale-product-info');if(!box)return;
    if(!product){box.innerHTML=`${icon('receipt')}<h2>${pending ? esc(pending.summary.productName) : 'Elige un producto'}</h2><p>${pending ? 'La confirmación se consultará con los datos originales de esta venta.' : 'Aquí verás su foto, precio y unidades disponibles.'}</p>`;app.querySelector('#sale-availability').textContent='';return;}
    const mode=saleMode(product),counted=['UNITS','UNIQUE'].includes(mode),available=option?.quantity ?? product.quantity;
    const unitPrice=option?.priceClp ?? product.priceClp,photo=safeImageUrl(option?.photo || product.photo);
    const valid=/^\d+$/.test(String(command.quantity)) && Number(command.quantity)>0 && Number(command.quantity)<=2147483647;
    box.innerHTML=`${photo ? `<img class="sales-product-photo" src="${esc(photo)}" alt="${esc(product.name)}">` : icon('receipt')}<h2>${esc(product.name)}</h2><p>${esc(option?.label || STOCK_MODES[mode])}</p><p>Precio por unidad</p><strong class="sales-price">${esc(pesos(unitPrice))}</strong><p class="sales-estimate">Total de referencia: <strong>${valid ? esc(pesos(BigInt(unitPrice)*BigInt(command.quantity))) : 'Revisa la cantidad'}</strong></p><p class="editor-hint">Se usará el precio que tenga el producto al registrar la venta.</p>`;
    const img=box.querySelector('img');if(img)img.onerror=()=>img.replaceWith(document.createTextNode('Imagen no disponible'));
    const availableCount=available ?? 0;
    const unitText=Number(availableCount)===1 ? '1 unidad disponible' : `${availableCount} unidades disponibles`;
    app.querySelector('#sale-availability').textContent=counted ? `${unitText}${mode==='UNIQUE' ? '. Esta pieza se vende de a una.' : '.'}` : mode==='ON_REQUEST' ? 'Por encargo: no se descontarán unidades.' : 'Sin conteo: no se descontarán unidades.';
  }
  async function review(){
    let command;
    try{command=saleCommand({requestId:crypto.randomUUID(),productId:form.productId,variantId:form.variantId || null,quantity:form.quantity,place:form.place.trim()});}
    catch(error){status(error.message,true);return;}
    lock();status('Comprobando el precio y las unidades actuales…');
    try{
      data=await db.ownerCatalog(shopId);if(!alive())return;
      const product=data.products.find(value=>value.id===command.productId),selection=saleSelection(product,command.variantId,command.quantity);
      busy=false;renderSale();
      const historyMessage=data.shop.historyEnabled ? 'El detalle se guardará en tu historial privado si sigue activado al confirmar.' : 'Tu historial está desactivado. Se actualizarán las unidades, pero no se guardará un detalle nuevo.';
      const unitMessage=['UNITS','UNIQUE'].includes(selection.mode) ? `Se descontarán ${command.quantity} unidades de esta opción o producto.` : 'No se descontarán unidades en esta modalidad.';
      const summary={productName:product.name,variantLabel:selection.option?.label || '',unitPrice:selection.unitPrice,historyEnabled:data.shop.historyEnabled};
      const speech=`Revisa esta venta. ${command.quantity} unidades de ${product.name}. ${summary.variantLabel ? 'Opción: '+summary.variantLabel+'.' : ''} Precio actual por unidad: ${selection.unitPrice} pesos chilenos. Total de referencia: ${selection.total} pesos chilenos. Lugar: ${command.place || 'No indicado'}. ${unitMessage} ${historyMessage} Se usará el precio vigente al registrar. Puedes volver o confirmar la venta.`;
      const dialog=document.createElement('dialog');dialog.id='sale-review';dialog.className='assistance-dialog';dialog.dataset.voiceGuide=speech;dialog.setAttribute('aria-labelledby','sale-review-title');
      dialog.innerHTML=`<h2 id="sale-review-title" tabindex="-1">Revisa tu venta.</h2><dl class="product-review-values"><dt>Producto</dt><dd>${esc(product.name)}</dd>${summary.variantLabel ? `<dt>Talla o color</dt><dd>${esc(summary.variantLabel)}</dd>` : ''}<dt>Cantidad</dt><dd>${command.quantity}</dd><dt>Precio actual por unidad</dt><dd>${esc(pesos(selection.unitPrice))}</dd><dt>Total de referencia</dt><dd>${esc(pesos(selection.total))}</dd><dt>Lugar</dt><dd>${esc(command.place || 'No indicado')}</dd></dl><p>${esc(unitMessage)}</p><p class="sales-notice">${esc(historyMessage)}</p><p>Se usará el precio que tenga el producto al registrar la venta.</p>${listen}<div class="assistance-actions"><button type="button" data-sale-action="close-review">Volver a corregir</button><button type="button" class="public-primary" id="sale-confirm">Confirmar venta</button></div>`;
      dialog.addEventListener('close',()=>{dialog.remove();app.querySelector('#sale-form button')?.focus({preventScroll:true});},{once:true});
      dialog.querySelector('#sale-confirm').addEventListener('click',async()=>{
        try{const value={uid:home.user.uid,shopId,command,summary};sessionStorage.setItem(key,JSON.stringify(value));pending=value;}
        catch{dialog.close();status('No pudimos conservar la confirmación en esta pestaña. No registramos la venta. Revisa el almacenamiento del sitio o usa otro navegador.',true);return;}
        dialog.close();await sendPending();
      });
      app.append(dialog);dialog.showModal();dialog.querySelector('h2').focus({preventScroll:true});dialog.scrollTop=0;
    }catch(error){busy=false;if(alive())renderSale(error.code==='invalid_sale' ? error.message : 'No pudimos comprobar el catálogo. Revisa la conexión y vuelve a revisar la venta.',true);}
  }
  async function sendPending(){
    if(!pending || busy)return;lock();status('Confirmando esta venta…');
    try{
      await db.recordOwnerSale(shopId,pending.command);if(!alive())return;
      lastSuccess='Venta confirmada. Se actualizó la disponibilidad según su modalidad. Puedes revisar el detalle guardado en Historial de ventas.';
      clearPending();form=initialForm();busy=false;await load('sale');
    }catch(error){
      busy=false;if(!alive())return;
      const rejected=error.code==='23514' || (error.code==='P0001' && /El producto no existe|Elige una opcion valida|Este producto no tiene opciones/i.test(error.message));
      if(rejected){try{clearPending();}catch{}renderSale('No se registró esta venta. '+(/stock/i.test(error.message) ? 'Ya no hay suficientes unidades. Actualiza el catálogo y corrige la cantidad.' : 'El producto o la cantidad ya no están disponibles. Actualiza el catálogo.'),true);}
      else renderSale(lastSuccess || 'No tenemos confirmación. Conservamos esta solicitud. Pulsa Reintentar confirmación; se usará el mismo registro para evitar duplicados.',true);
    }
  }
  function renderHistory(notice=''){
    view='history';shell(`${pending ? '<p class="sales-notice">Hay una venta por confirmar. Puedes consultar el historial y volver a Registrar una venta para reintentar su confirmación.</p>' : ''}<section class="editor-card" data-voice-guide="El historial muestra solo tus ventas guardadas. Puedes filtrar por fechas, nombre del producto y lugar. Los horarios corresponden a Chile. Cada venta tiene un botón para escucharla. Si desactivaste el historial, las ventas realizadas mientras estuvo desactivado no aparecen aquí."><h2>Consulta tus ventas guardadas</h2>${listen}<form id="sales-filters"><div class="sales-filter-fields"><div><label for="sales-from">Desde</label><input id="sales-from" type="date" value="${esc(filters.from)}"></div><div><label for="sales-to">Hasta (incluido)</label><input id="sales-to" type="date" value="${esc(filters.to)}"></div><div><label for="sales-product-filter">Producto</label><input id="sales-product-filter" type="search" value="${esc(filters.product)}" maxlength="120" placeholder="Nombre del producto"></div><div><label for="sales-place-filter">Lugar o feria</label><input id="sales-place-filter" type="search" value="${esc(filters.place)}" maxlength="240"></div></div><div class="owner-actions"><button class="public-primary" type="submit">Aplicar filtros</button><button class="owner-secondary" type="button" data-sale-action="clear-filters">Quitar filtros</button><button class="owner-secondary" type="button" data-sale-action="refresh">Actualizar historial</button></div></form><p class="editor-hint">Fechas y horarios de Chile. Se muestran los detalles que se guardaron mientras el historial estaba activado.</p></section><section id="sales-summary" class="sales-summary" aria-label="Resumen de ventas filtradas"></section><p id="sales-history-count" role="status"></p><div id="sales-records" class="sales-records"></div><nav class="sales-pagination" aria-label="Páginas del historial"><button type="button" class="owner-secondary" data-sale-action="previous-page">Página anterior</button><span id="sales-page"></span><button type="button" class="owner-secondary" data-sale-action="next-page">Página siguiente</button></nav><details class="editor-card sales-history-settings"><summary>Preferencias de mi historial</summary><form id="sales-settings"><label class="editor-check"><input id="sales-history-enabled" type="checkbox" ${data.shop.historyEnabled ? 'checked' : ''}>Guardar el detalle de las nuevas ventas</label><p>Si lo desactivas, las ventas seguirán actualizando las unidades disponibles. Las ventas nuevas no guardarán detalle y las anteriores se conservarán.</p><button type="submit" class="owner-secondary">Guardar preferencia del historial</button></form></details><p class="sales-notice">${data.shop.historyEnabled ? 'Tu historial está activado.' : 'Tu historial está desactivado. Aquí puedes consultar las ventas que guardaste anteriormente.'}</p>`,'Tu historial de ventas.');renderRows();if(notice)status(notice);
  }
  function renderRows(){
    let filtered;try{filtered=filterSales(records,filters);}catch(error){app.querySelector('#sales-records').innerHTML='';app.querySelector('#sales-summary').innerHTML='';app.querySelector('.sales-pagination').hidden=true;app.querySelector('#sales-history-count').textContent='Corrige las fechas para consultar el historial.';status(error.message,true);return;}
    app.querySelector('.sales-pagination').hidden=!filtered.length;
    page=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1));const start=page*20,rows=filtered.slice(start,start+20);
    const total=filtered.reduce((sum,row)=>sum+saleTotal(row),0n),units=filtered.reduce((sum,row)=>sum+BigInt(row.quantity),0n);
    app.querySelector('#sales-summary').innerHTML=`<div><span>Ventas guardadas</span><strong>${filtered.length}</strong></div><div><span>Unidades vendidas</span><strong>${units}</strong></div><div><span>Total guardado en estos filtros</span><strong>${esc(pesos(total))}</strong></div>`;
    app.querySelector('#sales-history-count').textContent=filtered.length ? `Mostrando ${start+1} a ${start+rows.length} de ${filtered.length} ventas guardadas.` : 'No hay ventas guardadas para estos filtros.';
    app.querySelector('#sales-records').innerHTML=rows.map(row=>{
      const product=data.products.find(product=>product.id===row.product_id),option=product?.variants.find(option=>option.id===row.variant_id);
      const optionText=row.variant_id ? (option ? `Opción: ${option.label} (nombre actual).` : 'Opción de un catálogo anterior.') : '';
      const date=dateFormat.format(new Date(Number(row.date_millis))),speech=`${row.product_name}. ${optionText} ${row.quantity} unidades. Precio por unidad: ${row.price_clp} pesos chilenos. Total: ${saleTotal(row)} pesos chilenos. Fecha de Chile: ${date}. Lugar: ${row.place || 'No indicado'}.`;
      return `<article class="editor-card sale-record" data-voice-guide="${esc(speech)}"><div class="sale-record-heading"><h3>${esc(row.product_name)}</h3><p>${esc(date)}</p></div>${optionText ? `<p>${esc(optionText)}</p>` : ''}<p>${row.quantity} unidades × ${esc(pesos(row.price_clp))}</p><strong>Total: ${esc(pesos(saleTotal(row)))}</strong><p>${esc(row.place || 'Lugar no indicado')}</p>${listen}</article>`;
    }).join('');
    app.querySelector('#sales-page').textContent=`Página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/20))}`;
    app.querySelector('[data-sale-action="previous-page"]').disabled=page===0;app.querySelector('[data-sale-action="next-page"]').disabled=start+20>=filtered.length;
  }
  const syncFormInput=event=>{const map={'sale-product':'productId','sale-quantity':'quantity','sale-place':'place'};if(!pending && map[event.target.id]){form[map[event.target.id]]=event.target.value;if(event.target.id==='sale-product'){form.variantId=null;fillVariants();}updatePreview();}};
  app.addEventListener('input',syncFormInput,{signal:events.signal});
  app.addEventListener('change',event=>{if(event.target.id==='sale-product')syncFormInput(event);},{signal:events.signal});
  app.addEventListener('click',async event=>{
    const variantChip=event.target.closest('[data-sale-variant]');
    if(variantChip && !busy && !pending){
      form.variantId=variantChip.dataset.saleVariant;
      app.querySelectorAll('[data-sale-variant]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===variantChip)));
      updatePreview();
      return;
    }
    const button=event.target.closest('[data-sale-action]');if(!button || busy || button.disabled)return;
    const action=button.dataset.saleAction;
    if(action==='qty-minus' || action==='qty-plus'){
      if(pending)return;
      const current=parseInt(form.quantity,10) || 1;
      const next=action==='qty-plus' ? Math.min(2147483647,current+1) : Math.max(1,current-1);
      form.quantity=String(next);
      const input=app.querySelector('#sale-quantity');if(input)input.value=form.quantity;
      updatePreview();
      return;
    }
    if(action==='back'){if(requestLeave())onBack();return;}
    if(action==='sale' || action==='history'){await load(action);return;}
    if(action==='refresh'){await load(view);return;}
    if(action==='close-review'){app.querySelector('#sale-review')?.close();return;}
    if(action==='clear-filters'){filters={from:'',to:'',product:'',place:''};page=0;renderHistory();return;}
    if(action==='previous-page' || action==='next-page'){page+=action==='next-page' ? 1 : -1;renderRows();app.querySelector('#sales-history-count').scrollIntoView({block:'nearest'});}
  },{signal:events.signal});
  app.addEventListener('submit',async event=>{
    if(!['sale-form','sales-filters','sales-settings'].includes(event.target.id))return;event.preventDefault();if(busy)return;
    if(event.target.id==='sale-form'){pending ? await sendPending() : await review();return;}
    if(event.target.id==='sales-filters'){filters={from:app.querySelector('#sales-from').value,to:app.querySelector('#sales-to').value,product:app.querySelector('#sales-product-filter').value,place:app.querySelector('#sales-place-filter').value};page=0;status('');renderRows();return;}
    const enabled=app.querySelector('#sales-history-enabled').checked;
    if(pending){status('Primero confirma la venta pendiente antes de cambiar esta preferencia.',true);return;}
    if(!enabled && !confirm('¿Dejar de guardar el detalle de las ventas nuevas? Sus unidades se actualizarán, pero no podrás recuperar esos detalles después. Las ventas anteriores se conservarán.'))return;
    lock();try{await db.setOwnerHistoryEnabled(shopId,enabled);busy=false;if(alive())await load('history','Guardamos la preferencia de tu historial.');}catch{busy=false;if(alive())renderHistory('No pudimos confirmar el cambio. Actualiza el historial para revisar la preferencia actual.');}
  },{signal:events.signal});
  window.addEventListener('beforeunload',event=>{if(busy || pending || dirty()){event.preventDefault();event.returnValue='';}},{signal:events.signal});
  load();
  return {requestLeave,dispose(){disposed=true;version++;events.abort();}};
}
