// Pruebas de RLS y RPC con roles reales de PostgreSQL, sin credenciales de la instancia de clase.
import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {pathToFileURL} from 'node:url';
let pool;
const ids={admin:'10000000-0000-0000-0000-000000000001',ana:'10000000-0000-0000-0000-000000000002',bea:'10000000-0000-0000-0000-000000000003',buyer:'10000000-0000-0000-0000-000000000004'};
before(async()=>{
 if(process.env.SQL_TEST_PGLITE_MODULE){
   const {PGlite}=await import(pathToFileURL(process.env.SQL_TEST_PGLITE_MODULE));const db=new PGlite();
   pool={async query(sql,args){const result=args?await db.query(sql,args):(await db.exec(sql)).at(-1);return {...result,rowCount:result?.affectedRows??result?.rows?.length??0};},async connect(){return {...pool,release(){}};},end:()=>db.close()};
 }else{
 const url=new URL(process.env.TEST_DATABASE_URL??'postgres://localhost/NO_CONFIGURADO');
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/conectasur_test','Usar exclusivamente el PostgreSQL desechable conectasur_test');
 pool=new pg.Pool({connectionString:url.toString(),max:4});
 }
 const tables=await pool.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
 assert.equal(tables.rows[0].n,0,'La base de pruebas debe estar vacia');
 await pool.query(readFileSync(new URL('./bootstrap-local.sql',import.meta.url),'utf8'));
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await pool.query(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
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
 it('solo el administrador activo lista cuentas administrativas',async()=>{
   await as('admin',async c=>assert.equal((await c.query('select * from public.list_platform_admins()')).rows[0].uid,ids.admin));
   for(const name of ['ana','buyer'])await assert.rejects(as(name,c=>c.query('select * from public.list_platform_admins()')),/administradora/);
   await assert.rejects(actor('anon',null,c=>c.query('select * from public.list_platform_admins()')),/permission denied/);
 });
 it('ni el admin salta los RPC escribiendo directamente roles o borrando perfiles',async()=>{
   for(const sql of ["update public.profiles set active=false where id='"+ids.admin+"'","delete from public.profiles where id='"+ids.admin+"'"])
     await assert.rejects(as('admin',c=>c.query(sql)),/permission denied/);
 });
 it('el único administrador no puede desactivar su propia cuenta',()=>assert.rejects(as('admin',c=>c.query('select public.update_platform_admin($1,$2,false,$2,true)',[ids.admin,'Administrador'])) ,/propia cuenta/));
 it('edita su nombre sin desactivar ni cambiar el rol',()=>as('admin',async c=>{
   const old=(await c.query('select display_name from public.profiles where id=$1',[ids.admin])).rows[0].display_name;
   await c.query('select public.update_platform_admin($1,$2,true,$3,true)',[ids.admin,'Nombre actualizado',old]);
   assert.equal((await c.query('select display_name from public.profiles where id=$1',[ids.admin])).rows[0].display_name,'Nombre actualizado');
 }));
 it('rechaza promover una cuenta existente fuera de la solicitud y una emprendedora',async()=>{
   for(const key of ['buyer','ana'])await assert.rejects(as('admin',c=>c.query('select public.provision_platform_admin($1,$2,$3)',[ids[key],'Nuevo',randomUUID()])),/corresponde|otro perfil/);
 });
 it('alta idempotente, edición, conflicto y desactivación conservan la identidad',async()=>{
   const uid=randomUUID(),request=randomUUID();
   await pool.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[uid,'admin-test@example.com',JSON.stringify({admin_creation_request:request})]);
   try{await as('admin',async c=>{
     await c.query('select public.provision_platform_admin($1,$2,$3)',[uid,'Nuevo',request]);
     await c.query('select public.provision_platform_admin($1,$2,$3)',[uid,'Nuevo',request]);
     await c.query('select public.update_platform_admin($1,$2,false,$3,true)',[uid,'Editado','Nuevo']);
     await c.query('select public.provision_platform_admin($1,$2,$3)',[uid,'Nuevo',request]);
     const result=(await c.query('select * from public.list_platform_admins()')).rows.find(row=>row.uid===uid);
     assert.equal(result.display_name,'Editado');assert.equal(result.active,false);assert.equal(result.email,'admin-test@example.com');
     const audit=(await c.query("select * from public.admin_actions where target_id=$1",[uid])).rows;assert.ok(audit.some(row=>row.actor_uid===ids.admin));
     await c.query('select public.update_platform_admin($1,$2,false,$3,true)',[uid,'Editado','Nuevo']); // respuesta perdida
     await assert.rejects(c.query('select public.update_platform_admin($1,$2,true,$3,true)',[uid,'Antiguo','Nuevo']),/otra sesión/);
   });}finally{await pool.query('delete from auth.users where id=$1',[uid]);}
 });
 it('un actor inactivo no conserva permisos usando un JWT existente',async()=>{
   const uid=randomUUID();await pool.query('insert into auth.users(id) values($1)',[uid]);await pool.query("update public.profiles set role='admin',active=false where id=$1",[uid]);
   try{await assert.rejects(actor('authenticated',uid,c=>c.query('select * from public.list_platform_admins()')),/administradora/);}
   finally{await pool.query('delete from auth.users where id=$1',[uid]);}
 });
 it('no reutiliza una solicitud de alta para otro nombre',async()=>{
   const uid=randomUUID(),request=randomUUID();await pool.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[uid,JSON.stringify({admin_creation_request:request})]);
   try{await assert.rejects(as('admin',async c=>{await c.query('select public.provision_platform_admin($1,$2,$3)',[uid,'Original',request]);await c.query('select public.provision_platform_admin($1,$2,$3)',[uid,'Alterado',request]);}),/otra creación/);}
   finally{await pool.query('delete from auth.users where id=$1',[uid]);}
 });
 it('las bajas simultáneas no dejan la plataforma sin administrador',{skip:!!process.env.SQL_TEST_PGLITE_MODULE},async()=>{
   const a=randomUUID(),b=randomUUID();
   for(const uid of [a,b]){await pool.query('insert into auth.users(id) values($1)',[uid]);await pool.query("update public.profiles set role='admin',display_name='Concurrente' where id=$1",[uid]);}
   await pool.query('update public.profiles set active=false where id=$1',[ids.admin]);
   async function disable(actorId,target){const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actorId]);await c.query("select public.update_platform_admin($1,'Concurrente',false,'Concurrente',true)",[target]);await c.query('commit');}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
   try{const result=await Promise.allSettled([disable(a,b),disable(b,a)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await pool.query("select count(*)::int as n from public.profiles where role='admin' and active")).rows[0].n,1);}
   finally{await pool.query('update public.profiles set active=true where id=$1',[ids.admin]);for(const uid of [a,b])await pool.query('delete from auth.users where id=$1',[uid]);}
 });
 it('el visitante lee la proyeccion publica sin stock',()=>actor('anon',null,async c=>{const r=await c.query('select * from public.public_products');assert.equal(r.rows.length,1);assert.equal('quantity' in r.rows[0],false)}));
 it('el visitante NO tiene permisos sobre productos privados',()=>assert.rejects(actor('anon',null,c=>c.query('select * from public.products')),/permission denied/));
 it('comprador y administrador NO leen stock privado',async()=>{for(const name of ['buyer','admin'])await as(name,async c=>assert.equal((await c.query('select * from public.products')).rows.length,0))});
 it('la dueña lee y edita su producto',()=>as('ana',async c=>{await c.query("update public.products set name='Nuevo' where id='p1'");assert.equal((await c.query("select name from public.products where id='p1'")).rows[0].name,'Nuevo')}));
 it('otra emprendedora NO puede editar el producto',()=>as('bea',async c=>assert.equal((await c.query("update public.products set name='Ajeno' where id='p1'")).rowCount,0)));
 it('el comprador NO escala su rol',()=>assert.rejects(as('buyer',c=>c.query("update public.profiles set role='admin' where id=$1",[ids.buyer])),/permission denied/));
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
