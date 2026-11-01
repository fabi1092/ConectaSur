// Administracion de la instancia del grupo mediante Studio Basic Auth.
// Solo se usa desde un computador de desarrollo, nunca en Android/web. No pide service_role.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function settings() {
  const values = process.env.CONECTASUR_PRIVATE ? JSON.parse(process.env.CONECTASUR_PRIVATE) : {};
  const url = values.url ?? process.env.SUPABASE_URL;
  if (!url || new URL(url).protocol !== 'https:') throw new Error('Se requiere una URL Supabase HTTPS');
  return {...values, url: url.replace(/\/$/, ''), anonKey: values.anonKey ?? process.env.SUPABASE_ANON_KEY,
    studioUser: values.studioUser ?? process.env.SUPABASE_STUDIO_USER,
    studioPassword: values.studioPassword ?? process.env.SUPABASE_STUDIO_PASSWORD};
}
export async function query(sql) {
  const config = settings();
  if (!config.studioUser || !config.studioPassword) throw new Error('Faltan las credenciales privadas de Studio');
  const response = await fetch(config.url + '/api/platform/pg-meta/default/query', {
    method:'POST',headers:{'User-Agent':'ConectaSur-migration-review','Content-Type':'application/json',
      Authorization:'Basic '+Buffer.from(config.studioUser+':'+config.studioPassword).toString('base64')},
    body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Studio SQL: '+(data.error?.message ?? data.message ?? response.status));
  return data;
}
export async function api(path,{token,method='GET',body,headers={}}={}) {
  const config=settings();
  const response=await fetch(config.url+path,{method,headers:{'User-Agent':'ConectaSur-migration-review',
    apikey:config.anonKey,Authorization:'Bearer '+(token??config.anonKey),
    ...(body ? {'Content-Type':'application/json'} : {}),...headers},
    body:body ? JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  const text=await response.text(); let data; try{data=JSON.parse(text)}catch{data=text}
  return {status:response.status,ok:response.ok,data};
}
export const literal=(value)=>"'"+String(value).replaceAll("'","''")+"'";
export async function migrate() {
  const sql=readFileSync(new URL('../migrations/001_conectasur.sql',import.meta.url),'utf8');
  const sha=createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
  const state=await query("select to_regclass('app_private.schema_migrations') as migrations");
  if(state[0]?.migrations){
    const previous=await query("select sha256 from app_private.schema_migrations where id='001_conectasur'");
    if(previous.length){if(previous[0].sha256!==sha)throw new Error('La migracion aplicada fue modificada; crear una nueva');console.log('Migracion 001 ya aplicada.');return;}
  }
  const record="create table if not exists app_private.schema_migrations(id text primary key,sha256 text not null,applied_at timestamptz not null default now()); insert into app_private.schema_migrations(id,sha256) values('001_conectasur',"+literal(sha)+");";
  await query(sql.replace(/commit;\s*$/,record+'\ncommit;'));
  console.log('Migracion 001 aplicada a la instancia del grupo.');
}
export async function seed() {
  const config=settings(); const accounts=config.accounts??{};
  if(!process.env.CONECTASUR_PRIVATE_OUTPUT)throw new Error('Definir CONECTASUR_PRIVATE_OUTPUT antes de crear datos ficticios');
  for(const [key,email] of Object.entries({admin:'admin@demo.conectasur.cl',ana:'ana@demo.conectasur.cl',bea:'bea@demo.conectasur.cl',buyer:'comprador@demo.conectasur.cl'})){
    if(accounts[key])continue;
    const password=randomBytes(24).toString('base64url');
    const result=await api('/auth/v1/signup',{method:'POST',body:{email,password,data:{display_name:key==='admin'?'Administrador demo':key==='ana'?'Ana Demo':key==='bea'?'Bea Demo':'Comprador Demo'}}});
    if(!result.ok||!result.data.user?.id)throw new Error('No se pudo crear la cuenta ficticia '+key+': '+result.status);
    accounts[key]={email,password,uid:result.data.user.id};
    writeFileSync(process.env.CONECTASUR_PRIVATE_OUTPUT,JSON.stringify({...config,accounts}));
  }
  // La salida privada se cifra con DPAPI por el lanzador local; no se imprime.
  if(!process.env.CONECTASUR_PRIVATE_OUTPUT)throw new Error('Definir CONECTASUR_PRIVATE_OUTPUT antes de crear datos ficticios');
  writeFileSync(process.env.CONECTASUR_PRIVATE_OUTPUT,JSON.stringify({...config,accounts}));
  const a=accounts;
  await query(`begin;
    update public.profiles set role='admin',display_name='Administrador demo',shop_id=null where id=${literal(a.admin.uid)};
    insert into public.shops(id,owner_uid,name,description,entrepreneur_type,sector,contact) values
      ('shop_demo_ana',${literal(a.ana.uid)},'Tejidos de Alerce','Tienda de ejemplo, datos ficticios.','Artesanías','Alerce','contacto@ejemplo.cl'),
      ('shop_demo_bea',${literal(a.bea.uid)},'Dulces del Sur','Tienda de ejemplo, datos ficticios.','Alimentos','Puerto Montt Centro','contacto@ejemplo.cl') on conflict(id) do nothing;
    update public.profiles set role='emprendedora',shop_id='shop_demo_ana' where id=${literal(a.ana.uid)};
    update public.profiles set role='emprendedora',shop_id='shop_demo_bea' where id=${literal(a.bea.uid)};
    insert into public.associations(id,name,sector,description) values('asoc_demo','Asociación Emprendedoras de Alerce (demo)','Alerce','Asociación ficticia.') on conflict(id) do nothing;
    insert into public.shop_associations values('shop_demo_ana','asoc_demo'),('shop_demo_bea','asoc_demo') on conflict do nothing;
    insert into public.categories values('Artesanías','Artesanías'),('Alimentos','Alimentos'),('Ropa','Ropa'),('Plantas','Plantas') on conflict do nothing;
    insert into public.entrepreneur_types values('Artesanías','Artesanías'),('Alimentos','Alimentos'),('Servicios','Servicios') on conflict do nothing;
    insert into public.product_types(id,name,fields) values
      ('artesania','Artesanía','{"material":"texto","tecnica":"texto","medidas":"texto"}'),
      ('alimento','Alimento','{"ingredientes":"texto","alergenos":"texto","contenido":"texto","conservacion":"texto"}'),
      ('ropa','Ropa y tejidos','{"material":"texto","cuidados":"texto"}'),
      ('planta','Planta viva','{"especie":"texto","cuidados":"texto"}') on conflict do nothing;
    commit;`);
  const products=[
    {id:'flores',shop_id:'shop_demo_ana',name:'Flores tejidas',description:'Flores decorativas tejidas a mano. Son artesanías, no plantas vivas.',category:'Artesanías',product_type:'artesania',attributes:{material:'Lana',tecnica:'Tejido'},price_clp:8000,show_price:true,stock_mode:'UNITS',quantity:3,photo:'flores',variants:[]},
    {id:'bandejas',shop_id:'shop_demo_ana',name:'Bandejas decoradas',description:'Bandejas decorativas para el hogar.',category:'Artesanías',product_type:'artesania',attributes:{material:'Madera'},price_clp:12000,show_price:true,stock_mode:'UNITS',quantity:2,photo:'bandejas',variants:[]},
    {id:'pedido',shop_id:'shop_demo_ana',name:'Artesanía por encargo',description:'Una creación hecha a tu gusto. Consulta el plazo.',category:'Artesanías',product_type:'artesania',price_clp:18000,show_price:false,stock_mode:'ON_REQUEST',quantity:null,photo:'bandejas',variants:[]},
    {id:'gorro',shop_id:'shop_demo_ana',name:'Gorro de lana (talla S/M/L)',description:'Gorro tejido en lana. Elige tu talla.',category:'Ropa',product_type:'ropa',price_clp:9500,show_price:true,stock_mode:'UNITS',quantity:6,photo:'flores',variants:[{id:'S',label:'Talla S',quantity:1},{id:'M',label:'Talla M',quantity:2},{id:'L',label:'Talla L',quantity:3}]},
    {id:'cuadro',shop_id:'shop_demo_bea',name:'Cuadro bordado (pieza única)',description:'Pieza única bordada a mano.',category:'Artesanías',product_type:'artesania',price_clp:25000,show_price:true,stock_mode:'UNIQUE',quantity:1,photo:'bandejas',variants:[]},
  ];
  for(const p of products){await query(`insert into public.products select * from jsonb_populate_record(null::public.products, ${literal(JSON.stringify({visible:true,attributes:{},...p,updated_at:new Date().toISOString()}))}::jsonb) on conflict(id) do nothing`);}
  console.log('Datos ficticios preparados: 4 cuentas, 2 tiendas y 5 productos. Credenciales guardadas de forma privada.');
}
export async function seedPhotos() {
  const config=settings();
  for(const owner of ['ana','bea']){
    const account=config.accounts[owner];
    const session=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}});
    if(!session.ok)throw new Error('No se pudo iniciar la cuenta de ejemplo');
    const token=session.data.access_token;const shop='shop_demo_'+owner;
    for(const name of ['flores','bandejas']){
      const bytes=readFileSync(new URL('../../android/app/src/main/res/drawable-nodpi/'+name+'.jpg',import.meta.url));
      const path=shop+'/ejemplos/'+name+'.jpg';
      const response=await fetch(config.url+'/storage/v1/object/shop-images/'+path,{method:'POST',headers:{
        'User-Agent':'ConectaSur-migration-review',apikey:config.anonKey,Authorization:'Bearer '+token,'Content-Type':'image/jpeg','x-upsert':'true'},body:bytes});
      if(!response.ok)throw new Error('No se pudo subir una foto de ejemplo: '+response.status);
      const url=config.url+'/storage/v1/object/public/shop-images/'+path;
      const update=await api('/rest/v1/products?shop_id=eq.'+shop+'&photo=eq.'+name,{method:'PATCH',token,body:{photo:url}});
      if(!update.ok)throw new Error('No se pudo vincular la foto al producto');
    }
    await api('/auth/v1/logout?scope=local',{method:'POST',token});
  }
  console.log('Fotografias de ejemplo subidas a Storage y vinculadas a los productos.');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const command=process.argv[2];
  try {if(command==='migrate')await migrate();else if(command==='seed')await seed();else if(command==='photos')await seedPhotos();else throw new Error('Usar migrate, seed o photos');}
  catch(error){console.error(error.message);process.exitCode=1;}
}
