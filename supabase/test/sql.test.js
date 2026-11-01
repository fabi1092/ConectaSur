// Pruebas de RLS y RPC con roles reales de PostgreSQL, sin credenciales de la instancia de clase.
import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
let pool;
const ids={admin:'10000000-0000-0000-0000-000000000001',ana:'10000000-0000-0000-0000-000000000002',bea:'10000000-0000-0000-0000-000000000003',buyer:'10000000-0000-0000-0000-000000000004'};
before(async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL??'postgres://localhost/NO_CONFIGURADO');
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/conectasur_test','Usar exclusivamente el PostgreSQL desechable conectasur_test');
 pool=new pg.Pool({connectionString:url.toString(),max:4});
 const tables=await pool.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
 assert.equal(tables.rows[0].n,0,'La base de pruebas debe estar vacia');
 await pool.query(readFileSync(new URL('./bootstrap-local.sql',import.meta.url),'utf8'));
 await pool.query(readFileSync(new URL('../migrations/001_conectasur.sql',import.meta.url),'utf8'));
 for(const id of Object.values(ids))await pool.query('insert into auth.users(id) values($1)',[id]);
 await pool.query("update public.profiles set role='admin' where id=$1",[ids.admin]);
 for(const [sid,uid] of [['ana',ids.ana],['bea',ids.bea]]){
   await pool.query('insert into public.shops(id,owner_uid,name) values($1,$2,$1)',[sid,uid]);
   await pool.query("update public.profiles set role='emprendedora',shop_id=$1 where id=$2",[sid,uid]);
 }
 await pool.query("insert into public.products(id,shop_id,name,price_clp,stock_mode,quantity) values('p1','ana','Flores',8000,'UNITS',3)");
});
after(async()=>{await pool?.end()});
async function actor(role,user,fn){const c=await pool.connect();try{
 await c.query('begin');await c.query('set local role '+role);
 await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);
 return await fn(c);
}finally{await c.query('rollback');c.release()}}
const as=(user,fn)=>actor('authenticated',ids[user],fn);
describe('PostgreSQL: RLS y RPC',()=>{
 it('el visitante lee la proyeccion publica sin stock',()=>actor('anon',null,async c=>{const r=await c.query('select * from public.public_products');assert.equal(r.rows.length,1);assert.equal('quantity' in r.rows[0],false)}));
 it('el visitante NO tiene permisos sobre productos privados',()=>assert.rejects(actor('anon',null,c=>c.query('select * from public.products')),/permission denied/));
 it('comprador y administrador NO leen stock privado',async()=>{for(const name of ['buyer','admin'])await as(name,async c=>assert.equal((await c.query('select * from public.products')).rows.length,0))});
 it('la dueña lee y edita su producto',()=>as('ana',async c=>{await c.query("update public.products set name='Nuevo' where id='p1'");assert.equal((await c.query("select name from public.products where id='p1'")).rows[0].name,'Nuevo')}));
 it('otra emprendedora NO puede editar el producto',()=>as('bea',async c=>assert.equal((await c.query("update public.products set name='Ajeno' where id='p1'")).rowCount,0)));
 it('el comprador NO escala su rol',()=>as('buyer',async c=>assert.equal((await c.query("update public.profiles set role='admin' where id=$1",[ids.buyer])).rowCount,0)));
 it('rechaza stock negativo',()=>assert.rejects(as('ana',c=>c.query("update public.products set quantity=-1 where id='p1'"))));
 it('rechaza variantes duplicadas',()=>assert.rejects(as('ana',c=>c.query("update public.products set variants=$1 where id='p1'",[JSON.stringify([{id:'S',label:'S',quantity:1},{id:'S',label:'S',quantity:2}])])),/duplicado/));
 it('ocultar precio de tienda cambia la proyeccion inmediatamente',()=>as('ana',async c=>{await c.query("update public.shops set show_prices=false where id='ana'");assert.equal((await c.query("select price_clp from public.public_products where id='p1'")).rows[0].price_clp,null)}));
 it('la emprendedora NO modifica campos administrativos de tienda',()=>assert.rejects(as('ana',c=>c.query("update public.shops set active=false where id='ana'")),/protegidos/));
 it('la venta descuenta y guarda historial, con recibo idempotente',()=>as('ana',async c=>{
   const id=randomUUID();const sql="select public.register_sale('ana','p1',null,1,'Prueba',$1)";
   await c.query(sql,[id]);await c.query(sql,[id]);
   assert.equal((await c.query("select quantity from public.products where id='p1'")).rows[0].quantity,2);
   assert.equal((await c.query('select * from public.sales')).rows.length,1);
 }));
 it('no acepta una venta sin stock suficiente',()=>assert.rejects(as('ana',c=>c.query("select public.register_sale('ana','p1',null,4,'Prueba',$1)",[randomUUID()])),/stock/));
 it('el administrador NO puede registrar ventas de otra persona',()=>assert.rejects(as('admin',c=>c.query("select public.register_sale('ana','p1',null,1,'Prueba',$1)",[randomUUID()])),/permiso/));
 it('el cliente NO puede insertar una venta evitando el RPC',()=>assert.rejects(as('ana',c=>c.query("insert into public.sales(id,shop_id,product_id,product_name,quantity,price_clp) values($1,'ana','p1','x',1,1)",[randomUUID()])),/permission denied/));
 it('los cambios administrativos generan auditoria de solo lectura',()=>as('admin',async c=>{await c.query("insert into public.associations(id,name) values('ci','Prueba')");const rows=(await c.query("select * from public.admin_actions where target_id='ci'")).rows;assert.equal(rows[0].actor_uid,ids.admin)}));
 it('el comprador NO falsifica auditoria',()=>assert.rejects(as('buyer',c=>c.query("insert into public.admin_actions(action,target_table) values('FALSO','shops')")),/permission denied/));
 it('la politica Storage permite la carpeta propia',()=>as('ana',async c=>{await c.query("insert into storage.objects(bucket_id,name) values('shop-images','ana/foto.jpg')");assert.equal((await c.query("select * from storage.objects")).rows.length,1)}));
 it('la politica Storage rechaza la carpeta ajena',()=>assert.rejects(as('ana',c=>c.query("insert into storage.objects(bucket_id,name) values('shop-images','bea/foto.jpg')")),/row-level security/));
});
