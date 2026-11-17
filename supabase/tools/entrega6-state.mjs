// Evidencia de la entrega 6 (backend de Felipe). Solo lectura: no crea ni modifica datos.
// Comprueba en la instancia del grupo que las migraciones 009 a 011 estan aplicadas y que
// public_fairs, upcoming_fairs, platform_settings y set_anonymous_navigation responden con
// los permisos RLS activos, igual que las consume la app y la web (clave anon, sin sesion).
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {query,settings,api} from './admin.mjs';

export const EXPECTED_MIGRATIONS=['009_ferias_mapas','010_navegacion_anonima','011_punto_de_venta'];
const MODES=['allow','invite','require'];
const PUERTO_MONTT={p_lat:-41.4693,p_lng:-72.9424};

// Parte con entrada/salida: recoge datos crudos de la instancia.
export async function gather() {
  const config=settings();
  if(!config.anonKey)throw new Error('Falta SUPABASE_ANON_KEY (clave anon publica del grupo)');
  const raw={};
  raw.migrations=(await query('select id from app_private.schema_migrations order by id')).map(r=>r.id);
  raw.objects=(await query(`select
    to_regclass('public.fairs') is not null as fairs,
    to_regclass('public.public_fairs') is not null as public_fairs,
    to_regclass('public.platform_settings') is not null as platform_settings,
    to_regprocedure('public.upcoming_fairs(double precision,double precision)') is not null as upcoming_fairs,
    to_regprocedure('public.set_anonymous_navigation(text)') is not null as set_anonymous_navigation`))[0];
  raw.rls=await query(`select c.relname as tabla,c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('fairs','platform_settings') order by c.relname`);
  raw.shopColumns=(await query(`select table_name,column_name from information_schema.columns
    where table_schema='public' and table_name in ('shops','public_shops') and column_name like 'pickup\\_%' order by 1,2`));
  raw.privileges=(await query(`select
    has_table_privilege('anon','public.fairs','SELECT') as anon_lee_fairs,
    has_table_privilege('anon','public.public_fairs','SELECT') as anon_lee_public_fairs,
    has_table_privilege('anon','public.platform_settings','SELECT') as anon_lee_settings,
    has_table_privilege('anon','public.platform_settings','UPDATE') as anon_escribe_settings,
    has_table_privilege('authenticated','public.platform_settings','UPDATE') as auth_escribe_settings,
    has_function_privilege('anon','public.upcoming_fairs(double precision,double precision)','EXECUTE') as anon_ejecuta_upcoming,
    has_function_privilege('anon','public.set_anonymous_navigation(text)','EXECUTE') as anon_ejecuta_set_nav,
    has_function_privilege('authenticated','public.set_anonymous_navigation(text)','EXECUTE') as auth_ejecuta_set_nav`))[0];
  raw.fairsByStatus=await query('select status,count(*)::int as filas from public.fairs group by status order by status');
  // Lo que hacen la app y la web: clave anon, sin sesion.
  const slim=r=>({status:r.status,ok:r.ok,data:r.data});
  raw.apiPublicFairs=slim(await api('/rest/v1/public_fairs?select=id,name,status,latitude,longitude,starts_at'));
  raw.apiUpcomingNoLocation=slim(await api('/rest/v1/rpc/upcoming_fairs',{method:'POST',body:{p_lat:null,p_lng:null}}));
  raw.apiUpcomingWithLocation=slim(await api('/rest/v1/rpc/upcoming_fairs',{method:'POST',body:PUERTO_MONTT}));
  raw.apiUpcomingInvalid=slim(await api('/rest/v1/rpc/upcoming_fairs',{method:'POST',body:{p_lat:95,p_lng:-72}}));
  raw.apiSettings=slim(await api('/rest/v1/platform_settings?select=anonymous_navigation&id=eq.true'));
  raw.apiFairsTable=slim(await api('/rest/v1/fairs?select=id&limit=1'));
  raw.apiPublicShops=slim(await api('/rest/v1/public_shops?select=id,pickup_label,pickup_lat,pickup_lng&limit=5'));
  // Sin sesion NO debe poder cambiar la opcion: se envia el valor actual, asi que aunque
  // los permisos estuvieran mal el valor guardado no cambiaria.
  const current=raw.apiSettings.data?.[0]?.anonymous_navigation;
  raw.apiSetNavigationAnon=slim(await api('/rest/v1/rpc/set_anonymous_navigation',{method:'POST',body:{p_mode:MODES.includes(current)?current:'allow'}}));
  return raw;
}

const check=(id,description,ok,detail='')=>({id,description,ok:Boolean(ok),detail:String(detail)});
const rejected=r=>r&&!r.ok&&r.status>=400&&r.status<500;
const isArray=r=>r&&r.ok&&Array.isArray(r.data);

// Parte pura (sin red): decide cumple / no cumple. Se puede probar con datos de ejemplo.
export function evaluate(raw) {
  const checks=[];
  for(const id of EXPECTED_MIGRATIONS)checks.push(check('MIG-'+id.slice(0,3),'Migracion '+id+' registrada en la instancia',raw.migrations.includes(id)));
  const o=raw.objects;
  checks.push(check('OBJ-fairs','Existen fairs, public_fairs y platform_settings',o.fairs&&o.public_fairs&&o.platform_settings,JSON.stringify(o)));
  checks.push(check('OBJ-rpc','Existen upcoming_fairs y set_anonymous_navigation',o.upcoming_fairs&&o.set_anonymous_navigation));
  checks.push(check('RLS-on','RLS activo en fairs y platform_settings',raw.rls.length===2&&raw.rls.every(r=>r.rls),JSON.stringify(raw.rls)));
  const names=table=>raw.shopColumns.filter(c=>c.table_name===table).map(c=>c.column_name).sort().join(',');
  const pickup='pickup_label,pickup_lat,pickup_lng';
  checks.push(check('COL-pickup','Columnas pickup_* en shops y en public_shops',names('shops')===pickup&&names('public_shops')===pickup,JSON.stringify(raw.shopColumns)));
  const p=raw.privileges;
  checks.push(check('PRIV-fairs','El visitante no lee la tabla fairs, solo la vista public_fairs',!p.anon_lee_fairs&&p.anon_lee_public_fairs));
  checks.push(check('PRIV-settings','El visitante lee platform_settings pero no la modifica',p.anon_lee_settings&&!p.anon_escribe_settings&&!p.auth_escribe_settings));
  checks.push(check('PRIV-rpc','upcoming_fairs es publica; set_anonymous_navigation solo para usuarios con sesion',p.anon_ejecuta_upcoming&&!p.anon_ejecuta_set_nav&&p.auth_ejecuta_set_nav));
  // API real con clave anon
  const pf=raw.apiPublicFairs;
  checks.push(check('API-public_fairs','public_fairs responde sin sesion y nunca muestra borradores',isArray(pf)&&pf.data.every(r=>['published','cancelled'].includes(r.status)),'HTTP '+pf.status));
  const nl=raw.apiUpcomingNoLocation;
  const byDate=isArray(nl)&&nl.data.every((r,i,a)=>i===0||new Date(a[i-1].starts_at)<=new Date(r.starts_at))&&nl.data.every(r=>r.distance_km===null);
  checks.push(check('API-upcoming-fecha','upcoming_fairs sin ubicacion (permiso rechazado): ordena por fecha y sin distancia',byDate,'HTTP '+nl.status+(isArray(nl)?', '+nl.data.length+' ferias':'')));
  const wl=raw.apiUpcomingWithLocation;
  const byDistance=isArray(wl)&&wl.data.every((r,i,a)=>typeof r.distance_km==='number'&&(i===0||a[i-1].distance_km<=r.distance_km));
  checks.push(check('API-upcoming-distancia','upcoming_fairs con ubicacion: ordena de la mas cercana a la mas lejana',byDistance,'HTTP '+wl.status+(isArray(wl)?', '+wl.data.length+' ferias':'')));
  checks.push(check('API-upcoming-invalida','upcoming_fairs rechaza una ubicacion invalida',rejected(raw.apiUpcomingInvalid),'HTTP '+raw.apiUpcomingInvalid.status));
  const st=raw.apiSettings;
  checks.push(check('API-settings','platform_settings entrega una opcion valida sin sesion',isArray(st)&&st.data.length===1&&MODES.includes(st.data[0].anonymous_navigation),isArray(st)?JSON.stringify(st.data):'HTTP '+st.status));
  checks.push(check('API-set-nav-anon','Sin sesion, set_anonymous_navigation es rechazada',rejected(raw.apiSetNavigationAnon),'HTTP '+raw.apiSetNavigationAnon.status));
  checks.push(check('API-fairs-tabla','Sin sesion, la tabla fairs no se puede leer',rejected(raw.apiFairsTable),'HTTP '+raw.apiFairsTable.status));
  checks.push(check('API-public_shops','public_shops expone pickup_* sin sesion',isArray(raw.apiPublicShops),'HTTP '+raw.apiPublicShops.status));
  return checks;
}

// Avisos que no son fallos del backend, pero importan para la demo del miercoles.
export function notes(raw) {
  const out=[];
  const upcoming=raw.apiUpcomingNoLocation?.data;
  if(Array.isArray(upcoming)&&upcoming.length<2)out.push('Hay '+upcoming.length+' feria(s) futura(s) publicada(s); para A12/A13 conviene tener al menos 2 (las carga Alonso).');
  if(Array.isArray(raw.apiPublicShops?.data)&&raw.apiPublicShops.data.every(r=>r.pickup_lat===null))out.push('Ninguna tienda tiene punto de retiro todavia; para A18 la emprendedora debe marcar uno en la app.');
  return out;
}

async function main() {
  const config=settings();
  if(new URL(config.url).hostname!=='supabase-surcode.codepulse.cl')throw new Error('Revisar la instancia exclusiva de SurCode');
  const raw=await gather();
  const checks=evaluate(raw);
  const failed=checks.filter(c=>!c.ok);
  const report={checkedAt:new Date().toISOString(),instance:config.url,entrega:6,
    summary:{total:checks.length,passed:checks.length-failed.length,failed:failed.length},
    migrationsRegistered:raw.migrations,fairsByStatus:raw.fairsByStatus,checks,notes:notes(raw),
    limits:['Solo lectura. No demuestra operaciones de escritura de administrador: eso lo cubren las pruebas SQL (npm --prefix supabase test) en GitHub Actions.',
      'Las respuestas de la API se comprobaron con la clave anon, sin sesion.']};
  const output=new URL('../../security/reports/entrega6-backend/',import.meta.url);
  mkdirSync(output,{recursive:true});
  writeFileSync(new URL('estado-servidor.json',output),JSON.stringify(report,null,2)+'\n');
  for(const c of checks)console.log((c.ok?'OK     ':'FALLA  ')+c.id.padEnd(24)+c.description+(c.ok||!c.detail?'':'  -> '+c.detail));
  for(const n of report.notes)console.log('AVISO  '+n);
  console.log('\n'+report.summary.passed+' de '+report.summary.total+' comprobaciones correctas.');
  if(failed.length)process.exitCode=1;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{await main();}catch(error){console.error(error.message);process.exitCode=1;}
}
