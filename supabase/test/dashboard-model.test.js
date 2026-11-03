import test from 'node:test';
import assert from 'node:assert/strict';
import { productSummary,dailySales } from '../../web/dashboard-model.js';
test('stock: solo modalidades contadas, incluyendo ocultos y sin contar encargos como agotados',()=>{
 const summary=productSummary([{stockMode:'UNITS',quantity:0},{stockMode:'UNIQUE',quantity:1},{stockMode:'UNITS',quantity:3},{stockMode:'UNITS',quantity:4},{stockMode:'ON_REQUEST',quantity:null},{stockMode:'UNLIMITED',quantity:null}]);
 assert.equal(summary.total,6);assert.equal(summary.empty.length,1);assert.equal(summary.low.length,2);
});
test('ventas: día de Chile, historial anterior separado y totales exactos',()=>{
 const rows=[{id:'b',date_millis:Date.parse('2026-11-03T01:00:00Z'),quantity:2,price_clp:8000},{id:'a',date_millis:Date.parse('2026-11-03T03:30:00Z'),quantity:3,price_clp:'9007199254740991'}];
 const summary=dailySales(rows,Date.parse('2026-11-03T12:00:00Z'));
 assert.equal(summary.day,'2026-11-03');assert.equal(summary.count,1);assert.equal(summary.units,3n);assert.equal(summary.total,27021597764222973n);assert.equal(summary.recent[0].id,'a');
 assert.deepEqual(rows.map(row=>row.id),['b','a']);
});
