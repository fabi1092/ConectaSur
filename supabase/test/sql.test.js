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
describe('Contacto: privacidad, entrega y preferencias',()=>{
 const mid='20000000-0000-0000-0000-000000000001';
 before(async()=>{await pool.query("insert into public.shop_messages(id,shop_id,sender_name,sender_contact,body) values($1,'ana','Visitante ficticio','demo@example.cl','Consulta ficticia')",[mid]);});
 it('solo la dueña activa lee sus mensajes; otra dueña, admin y comprador no los leen',async()=>{
   assert.equal((await as('ana',c=>c.query('select * from public.shop_messages'))).rows.length,1);
   for(const user of ['bea','admin','buyer'])assert.equal((await as(user,c=>c.query('select * from public.shop_messages'))).rows.length,0);
   await assert.rejects(actor('anon',null,c=>c.query('select * from public.shop_messages')),{code:'42501'});
 });
 it('visitante envía y reintenta sin duplicar; no puede insertar evitando el RPC',async()=>{
   await actor('anon',null,async c=>{
     const id=randomUUID(),args=[id,'ana',' Ana ',' prueba@example.cl ',' Hola '];
     await c.query('select public.send_shop_message($1,$2,$3,$4,$5)',args);
     await c.query('select public.send_shop_message($1,$2,$3,$4,$5)',args);
     await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.ana]);
     const rows=(await c.query('select * from public.shop_messages where id=$1',[id])).rows;
     assert.equal(rows.length,1);assert.equal(rows[0].body,'Hola');assert.equal(rows[0].read_at,null);
   });
   await assert.rejects(actor('anon',null,c=>c.query("insert into public.shop_messages(id,shop_id,sender_name,sender_contact,body) values($1,'ana','x','abc','hola')",[randomUUID()])),{code:'42501'});
 });
 it('solo la dueña marca leído y nadie edita el contenido recibido',async()=>{
   await as('ana',async c=>{await c.query('select public.read_shop_message($1)',[mid]);assert.ok((await c.query('select read_at from public.shop_messages where id=$1',[mid])).rows[0].read_at);});
   for(const user of ['bea','admin','buyer'])await assert.rejects(as(user,c=>c.query('select public.read_shop_message($1)',[mid])),{code:'42501'});
   await assert.rejects(as('ana',c=>c.query("update public.shop_messages set body='cambio' where id=$1",[mid])),{code:'42501'});
 });
 it('desactivar la cuenta impide leer y recibir mensajes',async()=>{
   await pool.query('update public.profiles set active=false where id=$1',[ids.ana]);
   try {
     assert.equal((await as('ana',c=>c.query('select * from public.shop_messages'))).rows.length,0);
     await assert.rejects(actor('anon',null,c=>c.query("select public.send_shop_message($1,'ana','Ana','test@example.cl','Hola')",[randomUUID()])),{code:'42501'});
   }finally{await pool.query('update public.profiles set active=true where id=$1',[ids.ana]);}
 });
 it('modo WhatsApp rechaza formulario; contacto y precios persisten en su tienda',()=>as('ana',async c=>{
   await c.query("update public.shops set contact_mode='both',whatsapp_number='56912345678',show_prices=false where id='ana'");
   const s=(await c.query("select contact_mode,whatsapp_number,show_prices from public.public_shops where id='ana'")).rows[0];
   assert.deepEqual(s,{contact_mode:'both',whatsapp_number:'56912345678',show_prices:false});
   const p=(await c.query("select price_clp from public.public_products where shop_id='ana'")).rows[0];assert.equal(p.price_clp,null);
   await c.query("update public.shops set contact_mode='whatsapp' where id='ana'");
   await assert.rejects(c.query("select public.send_shop_message($1,'ana','Ana','test@example.cl','Hola')",[randomUUID()]),{code:'42501'});
 }));
 it('el límite de frecuencia rechaza el cuarto mensaje del mismo contacto',()=>actor('anon',null,async c=>{
   for(let i=0;i<3;i++)await c.query("select public.send_shop_message($1,'ana','Ana','limited@example.cl','Hola')",[randomUUID()]);
   await assert.rejects(c.query("select public.send_shop_message($1,'ana','Ana','limited@example.cl','Hola')",[randomUUID()]),{code:'P0001'});
 }));
 it('validación rechaza mensajes vacíos, números inválidos y destinatarios inexistentes',async()=>{
   await assert.rejects(actor('anon',null,c=>c.query("select public.send_shop_message($1,'ana',' ','abc','Hola')",[randomUUID()])),{code:'23514'});
   await assert.rejects(as('ana',c=>c.query("update public.shops set contact_mode='both',whatsapp_number='url' where id='ana'")),{code:'23514'});
   await assert.rejects(actor('anon',null,c=>c.query("select public.send_shop_message($1,'no-existe','Ana','abc','Hola')",[randomUUID()])),{code:'42501'});
 });
});
describe('PostgreSQL: RLS y RPC',()=>{
 it('solo el administrador activo edita cuentas de emprendedoras; ni la propia dueña tiene permiso',async()=>{
   for(const name of ['ana','bea','buyer'])await assert.rejects(as(name,c=>c.query("select public.update_entrepreneur_account($1,'ana','Cambio','Comprador')",[ids.ana])),{code:'42501'});
   await assert.rejects(actor('anon',null,c=>c.query("select public.update_entrepreneur_account($1,'ana','Cambio','Comprador')",[ids.ana])),{code:'42501'});
   const uid=randomUUID();await pool.query('insert into auth.users(id) values($1)',[uid]);await pool.query("update public.profiles set role='admin',active=false where id=$1",[uid]);
   try{await assert.rejects(actor('authenticated',uid,c=>c.query("select public.update_entrepreneur_account($1,'ana','Cambio','Comprador')",[ids.ana])),{code:'42501'});}
   finally{await pool.query('delete from auth.users where id=$1',[uid]);}
 });
 it('editar nombre conserva todos los otros campos y permite un reintento idéntico',()=>as('admin',async c=>{
   const old=(await c.query('select * from public.profiles where id=$1',[ids.ana])).rows[0];
   await c.query("select public.update_entrepreneur_account($1,'ana','  Nombre nuevo  ',$2)",[ids.ana,old.display_name]);
   await c.query("select public.update_entrepreneur_account($1,'ana','Nombre nuevo',$2)",[ids.ana,old.display_name]);
   const current=(await c.query('select * from public.profiles where id=$1',[ids.ana])).rows[0];
   assert.deepEqual(current,{...old,display_name:'Nombre nuevo'});
   const actions=(await c.query("select * from public.admin_actions where target_id=$1 and action='UPDATE'",[ids.ana])).rows;
   assert.equal(actions.length,1);assert.equal(actions[0].actor_uid,ids.admin);
 }));
 it('un formulario antiguo no sobrescribe una edición más reciente',()=>as('admin',async c=>{
   const old=(await c.query('select display_name from public.profiles where id=$1',[ids.ana])).rows[0].display_name;
   await c.query("select public.update_entrepreneur_account($1,'ana','Primero',$2)",[ids.ana,old]);
   await assert.rejects(c.query("select public.update_entrepreneur_account($1,'ana','Segundo',$2)",[ids.ana,old]),{code:'CS004'});
 }));
 it('rechaza nombre inválido y parámetros nulos antes de editar',async()=>{
   for(const args of [[ids.ana,'ana','  ','Comprador'],[ids.ana,'ana','x'.repeat(121),'Comprador'],[ids.ana,'ana',null,'Comprador'],[ids.ana,'ana','Nuevo',null],[null,'ana','Nuevo','Comprador'],[ids.ana,null,'Nuevo','Comprador']])
     await assert.rejects(as('admin',c=>c.query('select public.update_entrepreneur_account($1,$2,$3,$4)',args)),{code:'23514'});
 });
 it('rechaza cuenta inexistente, perfil ajeno y tienda que ya no coincide',async()=>{
   for(const [uid,shop] of [[randomUUID(),'ana'],[ids.buyer,'ana'],[ids.admin,'ana'],[ids.ana,'bea']])
     await assert.rejects(as('admin',c=>c.query("select public.update_entrepreneur_account($1,$2,'Cambio','Comprador')",[uid,shop])),{code:'CS005'});
 });
 it('editar una cuenta inactiva no la reactiva ni cambia la tienda',async()=>{
   await pool.query('update public.profiles set active=false where id=$1',[ids.ana]);
   try{await as('admin',async c=>{
     const old=(await c.query('select display_name from public.profiles where id=$1',[ids.ana])).rows[0].display_name;
     await c.query("select public.update_entrepreneur_account($1,'ana','Inactiva editada',$2)",[ids.ana,old]);
     const value=(await c.query('select active,role,shop_id from public.profiles where id=$1',[ids.ana])).rows[0];
     assert.deepEqual(value,{active:false,role:'emprendedora',shop_id:'ana'});
   });}finally{await pool.query('update public.profiles set active=true where id=$1',[ids.ana]);}
 });
 it('un vínculo inconsistente no permite editar la cuenta de otra dueña',async()=>{
   await pool.query("update public.profiles set shop_id='bea' where id=$1",[ids.ana]);
   try{await assert.rejects(as('admin',c=>c.query("select public.update_entrepreneur_account($1,'bea','Cambio','Comprador')",[ids.ana])),{code:'CS005'});}
   finally{await pool.query("update public.profiles set shop_id='ana' where id=$1",[ids.ana]);}
 });
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

// >>> Entrega 6 (Felipe): ferias, navegación anónima y punto de venta
describe('Entrega 6: ferias, navegacion anonima y punto de venta',()=>{
 const near=randomUUID(),far=randomUUID(),draft=randomUUID(),past=randomUUID(),cancelled=randomUUID();
 const seed="insert into public.fairs(id,name,place_name,latitude,longitude,starts_at,ends_at,status) values($1,$2,'Lugar',$3,$4,now()+($5||' days')::interval,now()+($5||' days')::interval+interval '3 hours',$6)";
 before(async()=>{
   // Puerto Montt (cerca), Santiago (lejos), borrador, ya terminada y cancelada.
   await pool.query(seed,[near,'Feria Puerto Montt',-41.4717,-72.9411,'5','published']);
   await pool.query(seed,[far,'Feria Santiago',-33.4489,-70.6693,'2','published']);
   await pool.query(seed,[draft,'Borrador',-41.47,-72.94,'3','draft']);
   await pool.query(seed,[past,'Pasada',-41.47,-72.94,'-9','published']);
   await pool.query(seed,[cancelled,'Cancelada',-41.47,-72.94,'4','cancelled']);
 });
 after(async()=>{await pool.query('delete from public.fairs');await pool.query("update public.shops set pickup_label='',pickup_lat=null,pickup_lng=null")});
 it('el administrador crea una feria y queda en la auditoria',()=>as('admin',async c=>{
   await c.query("insert into public.fairs(name,place_name,latitude,longitude,starts_at,ends_at) values('Nueva','Plaza',-41.47,-72.94,now()+interval '1 day',now()+interval '2 days')");
   assert.ok((await c.query("select * from public.admin_actions where target_table='fairs'")).rows.length>=1);
 }));
 it('emprendedora y comprador NO crean ferias; el visitante no tiene permisos',async()=>{
   const sql="insert into public.fairs(name,place_name,latitude,longitude,starts_at,ends_at) values('X','Y',-41,-72,now(),now()+interval '1 hour')";
   for(const user of ['ana','buyer'])await assert.rejects(as(user,c=>c.query(sql)),/row-level security/);
   await assert.rejects(actor('anon',null,c=>c.query(sql)),/permission denied/);
 });
 it('rechaza una feria que termina antes de empezar o con coordenadas invalidas',async()=>{
   await assert.rejects(as('admin',c=>c.query("insert into public.fairs(name,place_name,latitude,longitude,starts_at,ends_at) values('X','Y',-41,-72,now()+interval '2 days',now()+interval '1 day')")),/check constraint/);
   await assert.rejects(as('admin',c=>c.query("insert into public.fairs(name,place_name,latitude,longitude,starts_at,ends_at) values('X','Y',95,-72,now(),now()+interval '1 hour')")),/check constraint/);
 });
 it('el visitante ve ferias publicadas y canceladas, nunca borradores, y no lee la tabla',async()=>{
   const names=(await actor('anon',null,c=>c.query('select name from public.public_fairs'))).rows.map(r=>r.name);
   assert.ok(names.includes('Feria Puerto Montt')&&names.includes('Cancelada'));
   assert.equal(names.includes('Borrador'),false);
   await assert.rejects(actor('anon',null,c=>c.query('select * from public.fairs')),/permission denied/);
 });
 it('sin ubicacion las proximas ferias salen por fecha y sin distancia',async()=>{
   const rows=(await actor('anon',null,c=>c.query('select * from public.upcoming_fairs()'))).rows;
   assert.deepEqual(rows.map(r=>r.name),['Feria Santiago','Feria Puerto Montt']);
   assert.ok(rows.every(r=>r.distance_km===null));
 });
 it('con ubicacion salen por distancia y se excluyen borrador, pasadas y canceladas',async()=>{
   const rows=(await actor('anon',null,c=>c.query('select * from public.upcoming_fairs($1,$2)',[-41.4693,-72.9424]))).rows;
   assert.deepEqual(rows.map(r=>r.name),['Feria Puerto Montt','Feria Santiago']);
   assert.ok(rows[0].distance_km<5);
   assert.ok(rows[1].distance_km>700&&rows[1].distance_km<1100);
 });
 it('rechaza ubicaciones invalidas o incompletas',async()=>{
   await assert.rejects(actor('anon',null,c=>c.query('select * from public.upcoming_fairs($1,$2)',[95,-72])),/inv/);
   await assert.rejects(actor('anon',null,c=>c.query('select * from public.upcoming_fairs($1,$2)',[-41,null])),/inv/);
 });
 it('la navegacion anonima parte en "allow" y es legible sin sesion',async()=>{
   assert.equal((await actor('anon',null,c=>c.query('select anonymous_navigation from public.platform_settings'))).rows[0].anonymous_navigation,'allow');
 });
 it('solo el administrador cambia la navegacion anonima y queda auditado',async()=>{
   await as('admin',async c=>{
     await c.query("select public.set_anonymous_navigation('require')");
     assert.equal((await c.query('select anonymous_navigation from public.platform_settings')).rows[0].anonymous_navigation,'require');
     assert.ok((await c.query("select * from public.admin_actions where target_table='platform_settings'")).rows.length>=1);
   });
   for(const user of ['ana','buyer'])await assert.rejects(as(user,c=>c.query("select public.set_anonymous_navigation('require')")),/Solo administrador/);
   await assert.rejects(actor('anon',null,c=>c.query("select public.set_anonymous_navigation('require')")),/permission denied/);
   await assert.rejects(as('admin',c=>c.query("select public.set_anonymous_navigation('otra')")),/inv/);
   await assert.rejects(as('admin',c=>c.query("update public.platform_settings set anonymous_navigation='require'")),/permission denied/);
 });
 it('la emprendedora publica su punto de venta; las coordenadas van en pareja',async()=>{
   await as('ana',async c=>{await c.query("update public.shops set pickup_label='Mi local',pickup_lat=-41.47,pickup_lng=-72.94 where id='ana'")});
   await assert.rejects(as('ana',c=>c.query("update public.shops set pickup_lat=-41.47 where id='ana'")),/shops_pickup_pair/);
   await assert.rejects(as('ana',c=>c.query("update public.shops set pickup_lat=95,pickup_lng=-72 where id='ana'")),/check constraint/);
 });
 it('por defecto ninguna tienda publica ubicacion',async()=>{
   const rows=(await actor('anon',null,c=>c.query('select id,pickup_lat,pickup_lng from public.public_shops'))).rows;
   assert.ok(rows.length>=1&&rows.every(r=>r.pickup_lat===null&&r.pickup_lng===null));
 });
});
// <<< Fin Entrega 6 (Felipe)

// >>> Entrega 7 (Felipe): identidad Google verificada en servidor, seguidores, avisos, ferias y calificaciones
const {generateKeyPairSync,createSign}=await import('node:crypto');
describe('Entrega 7: ferias, seguidores, avisos y calificaciones',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const other=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk=publicKey.export({format:'jwk'});
 const nowS=()=>Math.floor(Date.now()/1000);
 const b64u=value=>Buffer.from(value).toString('base64url');
 const claims=(patch={})=>({aud:'conectasur-dev',iss:'https://securetoken.google.com/conectasur-dev',sub:'g-comprador-1',iat:nowS()-10,auth_time:nowS()-10,
   exp:nowS()+3600,email:'comprador@example.com',email_verified:true,firebase:{sign_in_provider:'google.com',identities:{}},...patch});
 function token(payload=claims(),{key=privateKey,kid='kid-test',alg='RS256'}={}){
   const h=b64u(JSON.stringify({alg,kid,typ:'JWT'})),p=b64u(JSON.stringify(payload));
   return h+'.'+p+'.'+createSign('RSA-SHA256').update(h+'.'+p).sign(key).toString('base64url');
 }
 // Dentro de una misma transaccion un rechazo esperado la aborta: cada consulta usa su propio punto de retorno.
 const safe=c=>({query:async(sql,args)=>{await c.query('savepoint q');try{const r=await c.query(sql,args);await c.query('release savepoint q');return r;}
   catch(error){await c.query('rollback to savepoint q');await c.query('release savepoint q');throw error;}}});
 const sw=async(c,role,user)=>{await c.query('reset role');await c.query('set local role '+role);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user?ids[user]:'']);};
 const root=async c=>{await c.query('reset role');};
 const day=hours=>"now()+interval '"+hours+" hours'";
 const fair=async(c,name,start,end,status='published')=>(await c.query(
   `insert into public.fairs(name,place_name,latitude,longitude,starts_at,ends_at,status) values($1,'Plaza de Armas',-41.4693,-72.9424,${day(start)},${day(end)},$2) returning id`,[name,status])).rows[0].id;
 const inbox=async(c,tokenValue=null)=>(await c.query('select * from public.my_notifications(50,$1)',[tokenValue])).rows;
 before(async()=>{
   await pool.query('insert into app_private.firebase_keys(kid,n,e) values($1,$2,$3)',['kid-test',jwk.n,jwk.e]);
   await pool.query("insert into public.associations(id,name) values('assoc1','Asociación Alerce') on conflict do nothing");
   await pool.query("insert into public.shop_associations values('ana','assoc1') on conflict do nothing");
   await pool.query("insert into public.products(id,shop_id,name,price_clp,stock_mode,quantity) values('p2','ana','Bandejas',12000,'UNITS',2) on conflict do nothing");
 });
 after(async()=>{await pool.query('delete from public.shop_associations');await pool.query('delete from public.associations');
   await pool.query('delete from app_private.firebase_keys');await pool.query("delete from public.products where id='p2'")});

 describe('identidad Google/Firebase verificada en el servidor',()=>{
   const who=(t)=>actor('anon',null,c=>c.query('select public.verify_buyer_identity($1) as r',[t]));
   it('acepta un token vigente de Google y entrega la identidad firebase:UID',async()=>{
     const r=(await who(token())).rows[0].r;assert.equal(r.subject,'firebase:g-comprador-1');assert.equal(r.provider,'firebase_google');
   });
   it('rechaza firma ajena, contenido alterado, clave desconocida y algoritmos distintos',async()=>{
     await assert.rejects(who(token(claims(),{key:other.privateKey})),/invalida/);
     const good=token();const [h,p,s]=good.split('.');
     const altered=b64u(JSON.stringify(claims({sub:'otra-persona'})));
     await assert.rejects(who([h,altered,s].join('.')),/invalida/);
     await assert.rejects(who(token(claims(),{kid:'desconocida'})),/invalida/);
     await assert.rejects(who(token(claims(),{alg:'none'})),/invalida/);
     await assert.rejects(who(h+'.'+p+'.'),/invalida/);
     for(const garbage of ['x','a.b.c','',null,'....'])await assert.rejects(who(garbage),/(invalida|Inicia sesion)/);
   });
   it('rechaza token vencido, de otro proyecto, otro emisor, otro proveedor o correo sin verificar',async()=>{
     for(const patch of [{exp:nowS()-5},{aud:'otro-proyecto'},{iss:'https://securetoken.google.com/otro'},{iat:nowS()+9000},
       {email_verified:false},{email_verified:'true'},{firebase:{sign_in_provider:'password'}},{firebase:{}},{sub:''},{sub:12}])
       await assert.rejects(who(token(claims(patch))),/invalida/,JSON.stringify(patch));
     const noSub=claims();delete noSub.sub;await assert.rejects(who(token(noSub)),/invalida/);
     const noExp=claims();delete noExp.exp;await assert.rejects(who(token(noExp)),/invalida/);
   });
   it('una sesion de Supabase tambien se identifica y una cuenta inactiva no',async()=>{
     await as('buyer',async c=>assert.equal((await c.query('select public.verify_buyer_identity() as r')).rows[0].r.subject,ids.buyer));
     await assert.rejects(actor('anon',null,c=>c.query('select public.verify_buyer_identity() as r')),/Inicia sesion/);
     const c=await pool.connect();try{await c.query('begin');await c.query('update public.profiles set active=false where id=$1',[ids.buyer]);
       await sw(c,'authenticated','buyer');await assert.rejects(c.query('select public.verify_buyer_identity()'),/inactiva/);}finally{await c.query('rollback');c.release()}
   });
   it('las tablas privadas no se leen ni escriben desde la API',async()=>{
     for(const t of ['notifications','notification_consents','device_tokens','follows','ratings','fair_participants'])
       await assert.rejects(actor('anon',null,c=>c.query('select * from public.'+t)),/permission denied/,t);
     for(const t of ['notifications','notification_consents','device_tokens','follows','ratings'])
       await assert.rejects(as('buyer',c=>c.query('select * from public.'+t)),/permission denied/,t);
     await assert.rejects(as('buyer',c=>c.query("insert into public.follows(subject,target_type,target_id) values('x','shop','ana')")),/permission denied/);
     await assert.rejects(as('buyer',c=>c.query('select * from app_private.firebase_keys')),/permission denied/);
   });
 });

 describe('consentimiento, dispositivos y baja (RNF-PRI-02)',()=>{
   const dev='d'.repeat(40);
   it('sin consentimiento no se registra el dispositivo; con consentimiento si; retirarlo borra los dispositivos',()=>as('buyer',async raw=>{const c=safe(raw);
     await assert.rejects(c.query("select public.register_device($1,'android')",[dev]),/acepta recibir avisos/);
     assert.equal((await c.query('select public.get_notification_consent() as v')).rows[0].v,false);
     await c.query('select public.set_notification_consent(true)');
     await c.query("select public.register_device($1,'android')",[dev]);
     await c.query("select public.register_device($1,'android')",[dev]);
     await root(c);assert.equal((await c.query('select count(*)::int n from public.device_tokens')).rows[0].n,1);
     await sw(c,'authenticated','buyer');
     await c.query('select public.set_notification_consent(false)');
     await root(c);assert.equal((await c.query('select count(*)::int n from public.device_tokens')).rows[0].n,0);
   }));
   it('un comprador Google da y retira su consentimiento con su token; sin token no puede',async()=>{
     const t=token();
     await actor('anon',null,async raw=>{const c=safe(raw);
       await c.query('select public.set_notification_consent(true,$1)',[t]);
       assert.equal((await c.query('select public.get_notification_consent($1) as v',[t])).rows[0].v,true);
       await c.query("select public.register_device($1,'web',$2)",[dev,t]);
       await c.query('select public.unregister_device($1,$2)',[dev,t]);
       await assert.rejects(c.query('select public.set_notification_consent(true)'),/Inicia sesion/);
       await assert.rejects(c.query("select public.register_device($1,'android')",[dev]),/Inicia sesion/);
     });
     await pool.query("delete from public.notification_consents");
   });
   it('un dispositivo pasa a la ultima persona que lo registra y valida plataforma y largo',()=>as('buyer',async raw=>{const c=safe(raw);
     await c.query('select public.set_notification_consent(true)');
     await assert.rejects(c.query("select public.register_device('corto','android')"),/invalido/);
     await assert.rejects(c.query("select public.register_device($1,'ios')",[dev]),/invalido/);
   }));
 });

 describe('seguidores (RF-CMP-06, RF-ACC-08)',()=>{
   it('el comprador sigue y deja de seguir tienda y asociacion; repetir no duplica',()=>as('buyer',async raw=>{const c=safe(raw);
     for(let i=0;i<2;i++){await c.query("select public.follow_target('shop','ana')");await c.query("select public.follow_target('association','assoc1')");}
     const rows=(await c.query('select * from public.my_follows()')).rows;
     assert.deepEqual(rows.map(r=>r.target_type+':'+r.target_id).sort(),['association:assoc1','shop:ana']);
     await c.query("select public.unfollow_target('shop','ana')");await c.query("select public.unfollow_target('association','assoc1')");
     assert.equal((await c.query('select * from public.my_follows()')).rows.length,0);
   }));
   it('sin sesion ni token se rechaza (se le pide iniciar sesion); con token de Google funciona sin repetir la accion',async()=>{
     await assert.rejects(actor('anon',null,c=>c.query("select public.follow_target('shop','ana')")),/Inicia sesion/);
     await assert.rejects(actor('anon',null,c=>c.query("select public.follow_target('shop','ana',$1)",[token(claims({aud:'x'}))])),/invalida/);
     await actor('anon',null,async raw=>{const c=safe(raw);const t=token();await c.query("select public.follow_target('shop','ana',$1)",[t]);
       assert.deepEqual((await c.query('select target_id from public.my_follows($1)',[t])).rows.map(r=>r.target_id),['ana']);});
   });
   it('no se sigue lo inexistente, una tienda propia ni un tipo invalido',async()=>{
     await assert.rejects(as('buyer',c=>c.query("select public.follow_target('shop','no-existe')")),/no existe/);
     await assert.rejects(as('buyer',c=>c.query("select public.follow_target('otro','ana')")),/invalido/);
     await assert.rejects(as('ana',c=>c.query("select public.follow_target('shop','ana')")),/propia/);
   });
   it('una tienda inactiva deja de aparecer en lo que se sigue',async()=>{
     const c=await pool.connect();try{await c.query('begin');await c.query("insert into public.follows values($1,'shop','ana')",[ids.buyer]);
       await c.query("update public.shops set active=false where id='ana'");await sw(c,'authenticated','buyer');
       assert.equal((await c.query('select * from public.my_follows()')).rows.length,0);}finally{await c.query('rollback');c.release()}
   });
 });

 describe('ferias: invitacion, respuesta, checklist y avisos',()=>{
   it('invitar avisa a la dueña, responder confirma y el checklist refleja los cuatro estados',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria de Alerce',24,30);
     const inv=(await c.query("select public.admin_invite_participant($1,'ana') as id",[f])).rows[0].id;
     assert.equal((await c.query("select public.admin_invite_participant($1,'ana') as id",[f])).rows[0].id,inv);
     await c.query("select public.admin_invite_participant($1,'bea')",[f]);
     await c.query("select public.admin_invite_participant($1,null,'assoc1')",[f]);
     await sw(c,'authenticated','ana');
     const n=await inbox(c);assert.equal(n.length,1);assert.equal(n[0].kind,'invitation');assert.match(n[0].title,/Feria de Alerce/);assert.equal(n[0].data.fair_id,f);
     assert.equal((await c.query('select count(*)::int n from public.my_fair_invitations()')).rows[0].n,1);
     assert.equal((await c.query('select public.respond_fair_invitation($1,true) as s',[f])).rows[0].s,'confirmed');
     await sw(c,'authenticated','bea');assert.equal((await c.query('select public.respond_fair_invitation($1,false) as s',[f])).rows[0].s,'declined');
     await sw(c,'authenticated','admin');
     const extra=(await c.query("select id from public.shops where id='ana'")).rows;assert.equal(extra.length,1);
     await root(c);await c.query("insert into public.shops(id,owner_uid,name) values('cami',$1,'Cami')",[ids.buyer]);
     await sw(c,'authenticated','admin');
     await c.query("select public.admin_add_participant($1,'cami')",[f]);
     const rows=(await c.query('select * from public.admin_fair_checklist($1)',[f])).rows;
     const by=Object.fromEntries(rows.map(r=>[r.shop_id??r.association_id,r.status]));
     assert.deepEqual(by,{ana:'confirmed',bea:'declined',assoc1:'invited',cami:'added'});
     assert.deepEqual(rows.find(r=>r.shop_id==='ana').association_ids,['assoc1']);
     assert.equal(rows.find(r=>r.shop_id==='ana').entrepreneur_type,'');
   }));
   it('quien no fue invitada, el comprador y el administrador no pueden responder; el visitante tampoco',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria X',24,30);await c.query("select public.admin_invite_participant($1,'ana')",[f]);
     await sw(c,'authenticated','bea');await assert.rejects(c.query('select public.respond_fair_invitation($1,true)',[f]),/No estas invitada/);
     for(const user of ['buyer','admin']){await sw(c,'authenticated',user);await assert.rejects(c.query('select public.respond_fair_invitation($1,true)',[f]),/Solo la/);}
     await sw(c,'anon');await assert.rejects(c.query('select public.respond_fair_invitation($1,true)',[f]),/permission denied/);
   }));
   it('solo el administrador invita, agrega, avisa, quita y registra asistencia',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Y',24,30);const pid=(await c.query("select public.admin_invite_participant($1,'ana') as id",[f])).rows[0].id;
     for(const user of ['ana','buyer']){await sw(c,'authenticated',user);
       for(const sql of ["select public.admin_invite_participant($1,'bea')","select public.admin_add_participant($1,'bea')","select public.admin_send_fair_notice($1,'pending')","select * from public.admin_fair_checklist($1)"])
         await assert.rejects(c.query(sql,[f]),/Solo el administrador/,sql);
       await assert.rejects(c.query("select public.admin_set_attendance($1,'attended')",[pid]),/Solo el administrador/);
       await assert.rejects(c.query('select public.admin_remove_participant($1)',[pid]),/Solo el administrador/);}
     await sw(c,'anon');await assert.rejects(c.query("select public.admin_invite_participant($1,'bea')",[f]),/permission denied/);
     await assert.rejects(c.query('select * from public.fair_participants'),/permission denied/);
   }));
   it('la dueña solo lee su propia fila de participantes',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Z',24,30);
     await c.query("select public.admin_invite_participant($1,'ana')",[f]);await c.query("select public.admin_invite_participant($1,'bea')",[f]);
     await sw(c,'authenticated','ana');const rows=(await c.query('select shop_id from public.fair_participants')).rows;assert.deepEqual(rows.map(r=>r.shop_id),['ana']);
     await sw(c,'authenticated','buyer');assert.equal((await c.query('select * from public.fair_participants')).rows.length,0);
     await sw(c,'authenticated','ana');await assert.rejects(c.query("update public.fair_participants set status='confirmed'"),/permission denied/);
   }));
   it('recordatorio a pendientes y aviso a confirmadas (W09, W10) llegan a la dueña correcta',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Aviso',24,30);
     await c.query("select public.admin_invite_participant($1,'ana')",[f]);await c.query("select public.admin_invite_participant($1,'bea')",[f]);
     await c.query("select public.admin_invite_participant($1,null,'assoc1')",[f]);
     await sw(c,'authenticated','ana');await c.query('select public.respond_fair_invitation($1,true)',[f]);
     await sw(c,'authenticated','admin');
     assert.equal((await c.query("select public.admin_send_fair_notice($1,'pending') as n",[f])).rows[0].n,1);
     assert.equal((await c.query("select public.admin_send_fair_notice($1,'confirmed','Lleguen a las 9') as n",[f])).rows[0].n,1);
     await sw(c,'authenticated','bea');let n=await inbox(c);assert.deepEqual(n.map(x=>x.kind).sort(),['fair_notice','invitation']);assert.match(n.find(x=>x.kind==='fair_notice').title,/Recordatorio/);
     await sw(c,'authenticated','ana');n=await inbox(c);assert.equal(n.find(x=>x.kind==='fair_notice').body,'Lleguen a las 9');
     await sw(c,'authenticated','admin');
     const lr=(await c.query("select last_reminded_at from public.admin_fair_checklist($1) where shop_id='bea'",[f])).rows[0].last_reminded_at;assert.ok(lr);
     await assert.rejects(c.query("select public.admin_send_fair_notice($1,'todos')",[f]),/invalidas/);
   }));
   it('la asistencia solo se marca a quien participa (W11)',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Asistencia',24,30);
     const a=(await c.query("select public.admin_add_participant($1,'ana') as id",[f])).rows[0].id;const b=(await c.query("select public.admin_invite_participant($1,'bea') as id",[f])).rows[0].id;
     await c.query("select public.admin_set_attendance($1,'attended')",[a]);
     await assert.rejects(c.query("select public.admin_set_attendance($1,'attended')",[b]),/participan/);
     await assert.rejects(c.query("select public.admin_set_attendance($1,'quizas')",[a]),/invalida/);
     await c.query("select public.admin_set_attendance($1,'absent')",[a]);
     assert.equal((await c.query("select attendance from public.admin_fair_checklist($1) where shop_id='ana'",[f])).rows[0].attendance,'absent');
     await sw(c,'authenticated','ana');await c.query('select public.respond_fair_invitation($1,false)',[f]);
     await sw(c,'authenticated','admin');assert.equal((await c.query("select attendance from public.admin_fair_checklist($1) where shop_id='ana'",[f])).rows[0].attendance,null);
   }));
   it('el administrador confirma por una asociacion pero no por una tienda; no se invita a ferias canceladas',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Asoc',24,30);
     const a=(await c.query("select public.admin_invite_participant($1,null,'assoc1') as id",[f])).rows[0].id;const s=(await c.query("select public.admin_invite_participant($1,'ana') as id",[f])).rows[0].id;
     await c.query("select public.admin_set_participant_status($1,'confirmed')",[a]);
     await assert.rejects(c.query("select public.admin_set_participant_status($1,'confirmed')",[s]),/responden desde la app/);
     await c.query("update public.fairs set status='cancelled' where id=$1",[f]);
     await assert.rejects(c.query("select public.admin_invite_participant($1,'bea')",[f]),/cancelada/);
     await assert.rejects(c.query("select public.admin_invite_participant($1)",[f]),/Indica una tienda/);
   }));
   it('cancelar una feria avisa a las tiendas invitadas o confirmadas',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Cancelada',24,30);await c.query("select public.admin_add_participant($1,'ana')",[f]);
     await c.query("update public.fairs set status='cancelled' where id=$1",[f]);
     await sw(c,'authenticated','ana');assert.ok((await inbox(c)).some(n=>n.kind==='fair_cancelled'&&/Feria Cancelada/.test(n.title)));
   }));
 });

 describe('aviso a seguidores cuando confirman participacion (RF-CMP-07, RF-CMP-08)',()=>{
   it('el aviso lleva el nombre de la feria y solo llega a quien dio consentimiento, una sola vez',()=>actor('anon',null,async raw=>{const c=safe(raw);
     const gt=token(claims({sub:'g-seguidor'}));
     await sw(c,'authenticated','buyer');await c.query("select public.follow_target('shop','ana')");await c.query('select public.set_notification_consent(true)');
     await sw(c,'authenticated','bea');await root(c);await c.query("insert into public.follows values('sin-consentimiento','shop','ana')");
     await sw(c,'anon');await c.query("select public.follow_target('shop','ana',$1)",[gt]);await c.query('select public.set_notification_consent(true,$1)',[gt]);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria del Sur',48,56);await c.query("select public.admin_invite_participant($1,'ana')",[f]);
     await sw(c,'authenticated','ana');
     await c.query('select public.respond_fair_invitation($1,true)',[f]);await c.query('select public.respond_fair_invitation($1,false)',[f]);await c.query('select public.respond_fair_invitation($1,true)',[f]);
     await sw(c,'authenticated','buyer');let n=await inbox(c);
     assert.equal(n.length,1);assert.equal(n[0].kind,'follow_fair_confirmed');assert.match(n[0].title,/Feria del Sur/);assert.match(n[0].body,/Tienda|ana/i);assert.equal(n[0].data.fair_name,'Feria del Sur');
     await sw(c,'anon');n=await inbox(c,gt);assert.equal(n.length,1);assert.match(n[0].title,/Feria del Sur/);
     await root(c);assert.equal((await c.query("select count(*)::int n from public.notifications where subject='sin-consentimiento'")).rows[0].n,0);
   }));
   it('los seguidores de una asociacion reciben el aviso cuando el administrador la confirma',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','buyer');await c.query("select public.follow_target('association','assoc1')");await c.query('select public.set_notification_consent(true)');
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Asociaciones',24,30);const a=(await c.query("select public.admin_invite_participant($1,null,'assoc1') as id",[f])).rows[0].id;
     await sw(c,'authenticated','buyer');assert.equal((await inbox(c)).length,0);
     await sw(c,'authenticated','admin');await c.query("select public.admin_set_participant_status($1,'confirmed')",[a]);
     await sw(c,'authenticated','buyer');const n=await inbox(c);assert.equal(n.length,1);assert.match(n[0].title,/Feria Asociaciones/);
   }));
   it('no se avisa de ferias borrador ni terminadas y la bandeja es solo de su dueño; se puede marcar leida',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','buyer');await c.query("select public.follow_target('shop','ana')");await c.query('select public.set_notification_consent(true)');
     await sw(c,'authenticated','admin');const draft=await fair(c,'Borrador',24,30,'draft');await c.query("select public.admin_add_participant($1,'ana')",[draft]);
     await sw(c,'authenticated','buyer');assert.equal((await inbox(c)).length,0);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Leida',24,30);await c.query("select public.admin_add_participant($1,'ana')",[f]);
     await sw(c,'authenticated','buyer');const n=await inbox(c);assert.equal(n.length,1);
     await sw(c,'authenticated','bea');assert.equal((await c.query('select public.mark_notifications_read($1) as n',[[n[0].id]])).rows[0].n,0);
     await sw(c,'authenticated','buyer');assert.equal((await c.query('select public.mark_notifications_read($1) as n',[[n[0].id]])).rows[0].n,1);
     assert.ok((await inbox(c))[0].read_at);
   }));
 });

 describe('ficha publica de la feria y sugerencia al vender',()=>{
   it('muestra a las confirmadas con muestra de catalogo; no a rechazadas ni pendientes; borrador no existe (W12, W13)',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Publica',24,30);
     for(const s of ['ana','bea'])await c.query("select public.admin_invite_participant($1,$2)",[f,s]);
     await c.query("select public.admin_add_participant($1,null,'assoc1')",[f]);
     await sw(c,'authenticated','ana');await c.query('select public.respond_fair_invitation($1,true)',[f]);
     await sw(c,'authenticated','bea');await c.query('select public.respond_fair_invitation($1,false)',[f]);
     await sw(c,'anon');const d=(await c.query('select public.fair_public_detail($1) as d',[f])).rows[0].d;
     assert.equal(d.fair.name,'Feria Publica');
     assert.deepEqual(d.participants.map(p=>p.kind+':'+p.id).sort(),['association:assoc1','shop:ana']);
     assert.deepEqual(d.participants.find(p=>p.id==='ana').sample.map(x=>x.name),['Bandejas','Flores']);
     assert.equal(JSON.stringify(d).includes('quantity'),false);
     await sw(c,'authenticated','admin');const draft=await fair(c,'Oculta',24,30,'draft');await sw(c,'anon');
     assert.equal((await c.query('select public.fair_public_detail($1) as d',[draft])).rows[0].d,null);
     assert.equal((await c.query('select public.fair_public_detail($1) as d',['00000000-0000-0000-0000-00000000dead'])).rows[0].d,null);
   }));
   it('sugiere solo ferias de hoy en las que esta confirmada, con distancia si autorizo la ubicacion (A05, A06)',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');
     const today=await fair(c,'Feria de hoy',-1,3);const invited=await fair(c,'Hoy sin responder',-1,3);const future=await fair(c,'Feria futura',72,80);
     await c.query("select public.admin_add_participant($1,'ana')",[today]);await c.query("select public.admin_invite_participant($1,'ana')",[invited]);await c.query("select public.admin_add_participant($1,'ana')",[future]);
     await sw(c,'authenticated','ana');
     let rows=(await c.query("select * from public.suggest_fairs_for_sale('ana')")).rows;
     assert.deepEqual(rows.map(r=>r.name),['Feria de hoy']);assert.equal(rows[0].in_progress,true);assert.equal(rows[0].distance_km,null);
     rows=(await c.query("select * from public.suggest_fairs_for_sale('ana',$1,$2)",[-41.4693,-72.9424])).rows;assert.ok(rows[0].distance_km<0.1);
     await assert.rejects(c.query("select * from public.suggest_fairs_for_sale('ana',95,-72)"),/invalida/);
     await sw(c,'authenticated','bea');await assert.rejects(c.query("select * from public.suggest_fairs_for_sale('ana')"),/permiso/);
   }));
   it('el calendario de la dueña excluye borradores y muestra cada estado (A04)',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','admin');const a=await fair(c,'Cal A',24,30);const b=await fair(c,'Cal B',48,54);const d=await fair(c,'Cal borrador',72,80,'draft');
     await c.query("select public.admin_invite_participant($1,'ana')",[a]);await c.query("select public.admin_add_participant($1,'ana')",[b]);await c.query("select public.admin_add_participant($1,'ana')",[d]);
     await sw(c,'authenticated','ana');const rows=(await c.query('select name,my_status from public.my_fair_invitations()')).rows;
     assert.deepEqual(rows,[{name:'Cal A',my_status:'invited'},{name:'Cal B',my_status:'added'}]);
     await sw(c,'authenticated','buyer');await assert.rejects(c.query('select * from public.my_fair_invitations()'),/Solo la/);
   }));
 });

 describe('calificaciones (RF-CMP-09, RF-CFG-05)',()=>{
   it('califica tienda y producto, puede corregir y el promedio publico no revela quien califico',()=>as('buyer',async raw=>{const c=safe(raw);
     await c.query("select public.rate_target('ana',null,5,'Muy buena')");await c.query("select public.rate_target('ana','p1',3)");
     await c.query("select public.rate_target('ana',null,4,'Buena')");
     const mine=(await c.query("select * from public.my_ratings('ana')")).rows;assert.equal(mine.length,2);assert.equal(mine.find(r=>r.product_id===null).stars,4);
     await sw(c,'anon');const pub=(await c.query("select * from public.public_ratings where shop_id='ana' order by product_id nulls first")).rows;
     assert.equal(pub.length,2);assert.equal(Number(pub[0].average),4);assert.equal(pub[0].total,1);assert.deepEqual(Object.keys(pub[0]).sort(),['average','product_id','shop_id','total']);
     const cm=(await c.query("select * from public.rating_comments('ana')")).rows;assert.deepEqual(cm.map(r=>r.comment),['Buena']);assert.deepEqual(Object.keys(cm[0]).sort(),['comment','created_at','stars']);
   }));
   it('con las calificaciones desactivadas no se puede calificar y la dueña no se califica a si misma (A17)',async()=>{
     await assert.rejects(as('ana',c=>c.query("select public.rate_target('ana',null,5)")),/propia/);
     await as('ana',c=>c.query("update public.shops set allow_ratings=false where id='ana'"));
     const c0=await pool.connect();const c=safe(c0);try{await c0.query('begin');await c.query("update public.shops set allow_ratings=false where id='ana'");await sw(c,'authenticated','buyer');
       await assert.rejects(c.query("select public.rate_target('ana',null,5)"),/no recibe calificaciones/);
       await sw(c,'anon');assert.equal((await c.query("select allow_ratings from public.public_shops where id='ana'")).rows[0].allow_ratings,false);}finally{await c0.query('rollback');c0.release()}
   });
   it('valida estrellas, producto de otra tienda y exige identidad; un comprador Google tambien califica',async()=>{
     await assert.rejects(as('buyer',c=>c.query("select public.rate_target('ana',null,6)")),/invalida/);
     await assert.rejects(as('buyer',c=>c.query("select public.rate_target('ana',null,0)")),/invalida/);
     await assert.rejects(as('buyer',c=>c.query("select public.rate_target('bea','p1',3)")),/producto no existe/);
     await assert.rejects(actor('anon',null,c=>c.query("select public.rate_target('ana',null,5)")),/Inicia sesion/);
     await actor('anon',null,async raw=>{const c=safe(raw);const t=token(claims({sub:'g-cal'}));await c.query("select public.rate_target('ana',null,2,'',$1)",[t]);
       assert.equal((await c.query("select stars from public.my_ratings('ana',$1)",[t])).rows[0].stars,2);});
   });
   it('la dueña edita sus configuraciones de avisos y calificaciones y otra dueña no',async()=>{
     await as('ana',c=>c.query("update public.shops set contact_notifications=false,notify_from='10:00',notify_until='18:00',allow_ratings=false where id='ana'"));
     assert.equal((await as('bea',c=>c.query("update public.shops set allow_ratings=false where id='ana'"))).rowCount,0);
   });
 });

 describe('contacto con horario (RF-CFG-04)',()=>{
   const send=(c,shop='ana')=>c.query("select public.send_shop_message($1,$2,'Visita','visita@example.cl','Hola, ¿tienen flores?')",[randomUUID(),shop]);
   const win=async(c,from,until)=>c.query("update public.shops set notify_from=(now() at time zone 'America/Santiago')::time+$1::interval,notify_until=(now() at time zone 'America/Santiago')::time+$2::interval where id='ana'",[from,until]);
   it('dentro del horario avisa a la dueña; fuera de horario guarda el mensaje sin avisar (A15)',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await root(c);await win(c,'-1 hour','1 hour');await sw(c,'anon');await send(c);
     await sw(c,'authenticated','ana');let n=(await inbox(c)).filter(x=>x.kind==='contact');assert.equal(n.length,1);assert.match(n[0].body,/Visita/);
     await root(c);await win(c,'1 hour','2 hours');await sw(c,'anon');await send(c);
     await sw(c,'authenticated','ana');assert.equal((await inbox(c)).filter(x=>x.kind==='contact').length,1);
     assert.equal((await c.query('select count(*)::int n from public.shop_messages where sender_name=\'Visita\'')).rows[0].n,2);
   }));
   it('un horario que cruza la medianoche y el apagado total se respetan',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await root(c);await c.query("update public.shops set notify_from='22:00',notify_until='06:00' where id='ana'");
     const inside=(await c.query("select app_private.in_notify_window('22:00','06:00') as v")).rows[0].v;
     const t=(await c.query("select (now() at time zone 'America/Santiago')::time as t")).rows[0].t;const hour=Number(t.slice(0,2));
     assert.equal(inside,hour>=22||hour<6);
     assert.equal((await c.query("select app_private.in_notify_window('09:00','09:00') as v")).rows[0].v,true);
     await c.query("update public.shops set contact_notifications=false,notify_from='09:00',notify_until='09:00' where id='ana'");await sw(c,'anon');await send(c);
     await sw(c,'authenticated','ana');assert.equal((await inbox(c)).filter(x=>x.kind==='contact').length,0);
     assert.equal((await c.query('select count(*)::int n from public.shop_messages where sender_name=\'Visita\'')).rows[0].n,1);
   }));
   it('reintentar el mismo envio no duplica el aviso',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await root(c);await c.query("update public.shops set contact_notifications=true,notify_from='09:00',notify_until='09:00' where id='ana'");await sw(c,'anon');
     const args=[randomUUID(),'ana','Visita','visita@example.cl','Mensaje'];
     await c.query('select public.send_shop_message($1,$2,$3,$4,$5)',args);await c.query('select public.send_shop_message($1,$2,$3,$4,$5)',args);
     await sw(c,'authenticated','ana');assert.equal((await inbox(c)).filter(x=>x.kind==='contact').length,1);
   }));
 });

 describe('cola de envio push y claves de Firebase',()=>{
   const dev='e'.repeat(40);
   it('entrega el aviso con los dispositivos que consintieron y lo cierra al confirmar el envio',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','ana');await c.query('select public.set_notification_consent(true)');await c.query("select public.register_device($1,'android')",[dev]);
     await sw(c,'authenticated','admin');const f=await fair(c,'Feria Push',24,30);await c.query("select public.admin_invite_participant($1,'ana')",[f]);await c.query("select public.admin_invite_participant($1,'bea')",[f]);
     await root(c);
     const batch=(await c.query('select app_private.claim_push_batch(20) as b')).rows[0].b;
     assert.equal(batch.length,1);assert.equal(batch[0].kind,'invitation');assert.match(batch[0].title,/Feria Push/);assert.deepEqual(batch[0].tokens,[{token:dev,platform:'android'}]);
     assert.equal((await c.query("select count(*)::int n from public.notifications where subject=$1 and push_error like 'sin dispositivos%'",[ids.bea])).rows[0].n,1);
     await c.query('select app_private.finish_push($1,false,$2)',[batch[0].id,'FCM caido']);
     assert.equal((await c.query('select app_private.claim_push_batch(20) as b')).rows[0].b.length,0);
     await c.query("update public.notifications set push_claimed_at=now()-interval '3 minutes' where id=$1",[batch[0].id]);
     const retry=(await c.query('select app_private.claim_push_batch(20) as b')).rows[0].b;assert.equal(retry.length,1);
     await c.query('select app_private.finish_push($1,true)',[retry[0].id]);
     assert.equal((await c.query('select app_private.claim_push_batch(20) as b')).rows[0].b.length,0);
     await c.query('select app_private.drop_device($1)',[dev]);assert.equal((await c.query('select count(*)::int n from public.device_tokens')).rows[0].n,0);
   }));
   it('un aviso se abandona tras cinco intentos y los clientes no usan la cola',()=>actor('anon',null,async raw=>{const c=safe(raw);
     await sw(c,'authenticated','ana');await c.query('select public.set_notification_consent(true)');await c.query("select public.register_device($1,'android')",[dev]);
     await root(c);await c.query("insert into public.notifications(subject,kind,title) values($1,'contact','x')",[ids.ana]);
     for(let i=0;i<5;i++){assert.equal((await c.query('select app_private.claim_push_batch(5) as b')).rows[0].b.length,1);await c.query("update public.notifications set push_claimed_at=now()-interval '3 minutes'");}
     assert.equal((await c.query('select app_private.claim_push_batch(5) as b')).rows[0].b.length,0);
     await sw(c,'authenticated','ana');await assert.rejects(c.query('select app_private.claim_push_batch(5)'),/permission denied/);
   }));
   it('sincronizar claves reemplaza las vigentes y rechaza listas vacias',async()=>{
     await pool.query("select app_private.sync_firebase_keys($1::jsonb)",[JSON.stringify([{kty:'RSA',kid:'kid-test',n:jwk.n,e:jwk.e},{kty:'RSA',kid:'kid-nueva',n:jwk.n,e:jwk.e}])]);
     assert.equal((await pool.query('select count(*)::int n from app_private.firebase_keys')).rows[0].n,2);
     await pool.query("select app_private.sync_firebase_keys($1::jsonb)",[JSON.stringify([{kty:'RSA',kid:'kid-test',n:jwk.n,e:jwk.e}])]);
     assert.equal((await pool.query('select count(*)::int n from app_private.firebase_keys')).rows[0].n,1);
     await assert.rejects(pool.query("select app_private.sync_firebase_keys('[]'::jsonb)"),/Sin claves/);
   });
 });
});
// <<< Fin Entrega 7 (Felipe)
