import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saleCommand,saleSelection,saleMode,pesos,saleTotal,chileDay,filterSales} from '../../web/sales-model.js';
const command={requestId:'fcac9781-ae7e-4790-b4d2-9ecdd4fbd331',productId:'flores',variantId:null,quantity:1,place:''};
test('cantidad de venta exige entero positivo y datos identificables sin campos arbitrarios',()=>{
  assert.equal(saleCommand({...command,quantity:'2'}).quantity,2);
  for(const quantity of [0,-1,1.5,'1.5','1,5','8.000',2147483648,NaN])assert.throws(()=>saleCommand({...command,quantity}),/entera/);
  assert.throws(()=>saleCommand({...command,ownerUid:'otra'}));assert.throws(()=>saleCommand({...command,place:'x'.repeat(241)}));assert.throws(()=>saleCommand({...command,requestId:'sin-id'}));
});
test('total de venta conserva exactamente enteros superiores al máximo seguro de Number',()=>{
  const row={price_clp:Number.MAX_SAFE_INTEGER,quantity:3};assert.equal(saleTotal(row),27021597764222973n);
  assert.ok(pesos(saleTotal(row)).includes('27.021.597.764.222.973'));assert.equal(saleTotal({price_clp:0,quantity:10}),0n);
});
test('selección descuenta según la opción elegida y respeta fallback por encargo',()=>{
  const product={stockMode:'UNITS',quantity:2,soldOut:'ORDER',priceClp:8000,variants:[{id:'a',label:'Natural',quantity:2,priceClp:9500},{id:'b',label:'Rojo',quantity:0}]};
  assert.equal(saleSelection(product,'a',2).total,19000n);assert.throws(()=>saleSelection(product,'b',1),/Quedan 0/);assert.throws(()=>saleSelection(product,null,1),/Elige una talla/);
  const empty={...product,quantity:0,variants:[]};assert.equal(saleMode(empty),'ON_REQUEST');assert.equal(saleSelection(empty,null,8).available,null);
  assert.throws(()=>saleSelection({...empty,soldOut:'HIDE'},null,1),/Quedan 0/);
});
test('filtro incluye el día calendario chileno aunque la fecha UTC ya sea el siguiente día',()=>{
  const row={date_millis:Date.parse('2026-11-03T02:30:00Z'),product_name:'Flores tejidas',place:'Fería de Alerce'};
  assert.equal(chileDay(row.date_millis),'2026-11-02');assert.equal(filterSales([row],{from:'2026-11-02',to:'2026-11-02',product:'tejidas',place:'feria'}).length,1);
  assert.equal(filterSales([row],{from:'2026-11-03'}).length,0);
});
test('fechas inexistentes y rangos invertidos no producen totales engañosos',()=>{
  assert.throws(()=>filterSales([],{from:'2026-02-30'}),/fechas/);assert.throws(()=>filterSales([],{from:'2026-11-03',to:'2026-11-02'}),/inicial/);
});
