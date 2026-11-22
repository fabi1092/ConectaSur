// Evidencia de la entrega 7 (backend de Felipe). No deja datos: lo unico que escribe es el informe JSON local.
// 1) Comprueba en la instancia del grupo que las migraciones 012 a 014 estan aplicadas y que los permisos son los esperados.
// 2) Llama la API real con la clave anon, sin sesion, como lo hacen la app y la web.
// 3) Ejecuta el recorrido completo (invitar, responder, seguir, avisar, ficha publica, calificar) dentro de UNA transaccion
//    que termina siempre en error a proposito: PostgreSQL deshace todo, asi que no queda ninguna feria ni aviso de prueba.
// Opcional: FIREBASE_TEST_ID_TOKEN (un ID token de Google vigente, copiado de la app) comprueba la validacion real de Firebase.
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {query,settings,api} from './admin.mjs';

export const EXPECTED_MIGRATIONS=['012_identidad_notificaciones','013_seguidores_calificaciones','014_participantes_ferias'];
const PRIVATE_TABLES=['follows','device_tokens','notifications','notification_consents','ratings','fair_participants'];
const ZERO='00000000-0000-0000-0000-000000000000';

// Recorrido de extremo a extremo con las cuentas reales de la instancia. Siempre termina en excepcion => rollback.
export const E2E_SQL=`do $e2e$
declare admin_uid uuid; buyer_uid uuid; s1 text; s2 text; o1 uuid; f uuid; r jsonb:='{}'::jsonb; n integer; x jsonb; st text; rating_ok boolean;
begin
 select id into admin_uid from public.profiles where role='admin' and active order by created_at limit 1;
 select id into buyer_uid from public.profiles where role='comprador' and active order by created_at limit 1;
 select s.id,s.owner_uid into s1,o1 from public.shops s join public.profiles p on p.id=s.owner_uid where s.active and p.active order by s.id limit 1;
 select s.id into s2 from public.shops s join public.profiles p on p.id=s.owner_uid where s.active and p.active and s.id<>s1 order by s.id limit 1;
 if admin_uid is null or buyer_uid is null or s1 is null or s2 is null then raise exception 'E2E_SKIP:faltan un administrador, un comprador o dos tiendas activas'; end if;
 select allow_ratings into rating_ok from public.shops where id=s1;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',admin_uid::text,true);
 insert into public.fairs(name,place_name,latitude,longitude,starts_at,ends_at,status)
  values('Feria de prueba E2E','Plaza de Armas',-41.4693,-72.9424,now()+interval '2 days',now()+interval '2 days 4 hours','published') returning id into f;
 perform public.admin_invite_participant(f,s1);
 perform public.admin_add_participant(f,s2);
 perform set_config('request.jwt.claim.sub',buyer_uid::text,true);
 perform public.set_notification_consent(true);
 perform public.follow_target('shop',s1);
 perform set_config('request.jwt.claim.sub',o1::text,true);
 select count(*) into n from public.my_notifications(50) where kind='invitation' and data->>'fair_id'=f::text;
 r:=r||jsonb_build_object('A01_invitacion_llega_a_la_duena',n=1);
 select count(*) into n from public.my_fair_invitations() where fair_id=f and my_status='invited';
 r:=r||jsonb_build_object('A04_calendario_de_la_duena',n=1);
 select public.respond_fair_invitation(f,true) into st;
 r:=r||jsonb_build_object('A02_participo_con_un_toque',st='confirmed');
 perform set_config('request.jwt.claim.sub',admin_uid::text,true);
 select jsonb_object_agg(coalesce(shop_id,association_id),status) into x from public.admin_fair_checklist(f);
 r:=r||jsonb_build_object('W07_checklist_confirmada',x->>s1='confirmed','W05_agregada_directa',x->>s2='added');
 perform set_config('request.jwt.claim.sub',buyer_uid::text,true);
 select count(*) into n from public.my_notifications(50) where kind='follow_fair_confirmed' and title like '%Feria de prueba E2E%';
 r:=r||jsonb_build_object('A13_aviso_al_seguidor_con_nombre_de_feria',n=1);
 reset role; set local role anon; perform set_config('request.jwt.claim.sub','',true);
 x:=public.fair_public_detail(f);
 r:=r||jsonb_build_object('W12_ficha_publica_con_confirmadas',x is not null and jsonb_array_length(x->'participants')=2);
 begin perform public.follow_target('shop',s1); r:=r||jsonb_build_object('W16_sin_sesion_se_pide_login',false);
 exception when others then r:=r||jsonb_build_object('W16_sin_sesion_se_pide_login',true); end;
 reset role; set local role authenticated; perform set_config('request.jwt.claim.sub',buyer_uid::text,true);
 if rating_ok then perform public.rate_target(s1,null,5,'Prueba E2E'); r:=r||jsonb_build_object('A17_califica_la_tienda',(select stars from public.my_ratings(s1) where product_id is null)=5); end if;
 perform public.unfollow_target('shop',s1);
 select count(*) into n from public.my_follows();
 r:=r||jsonb_build_object('W17_deja_de_seguir',n=0);
 reset role;
 raise exception 'E2E_RESULT:%',r::text;
end
$e2e$`;

export async function runE2E({run=query}={}) {
  try{await run(E2E_SQL);return {error:'El recorrido termino sin deshacerse: revisar'};}
  catch(error){
    const message=String(error.message);
    const result=/E2E_RESULT:(\{[^}]*\})/.exec(message);
    if(result)return {result:JSON.parse(result[1])};
    const skip=/E2E_SKIP:(.*)/s.exec(message);
    if(skip)return {skipped:skip[1].trim()};
    return {error:message};
  }
}

export async function gather() {
  const config=settings();
  if(!config.anonKey)throw new Error('Falta SUPABASE_ANON_KEY (clave anon publica del grupo)');
  const raw={};
  const slim=r=>({status:r.status,ok:r.ok,data:r.data});
  raw.migrations=(await query('select id from app_private.schema_migrations order by id')).map(r=>r.id);
  raw.objects=(await query(`select
    to_regclass('public.fair_participants') is not null as fair_participants, to_regclass('public.follows') is not null as follows,
    to_regclass('public.ratings') is not null as ratings, to_regclass('public.device_tokens') is not null as device_tokens,
    to_regclass('public.notification_consents') is not null as notification_consents, to_regclass('public.notifications') is not null as notifications,
    to_regclass('public.public_ratings') is not null as public_ratings,
    to_regprocedure('public.verify_buyer_identity(text)') is not null as verify_buyer_identity,
    to_regprocedure('app_private.verify_firebase_token(text)') is not null as verify_firebase_token,
    to_regprocedure('public.follow_target(text,text,text)') is not null as follow_target,
    to_regprocedure('public.respond_fair_invitation(uuid,boolean)') is not null as respond_fair_invitation,
    to_regprocedure('public.fair_public_detail(uuid)') is not null as fair_public_detail,
    to_regprocedure('public.rate_target(text,text,integer,text,text)') is not null as rate_target,
    to_regprocedure('public.register_device(text,text,text)') is not null as register_device,
    to_regprocedure('public.admin_fair_checklist(uuid)') is not null as admin_fair_checklist,
    to_regprocedure('app_private.claim_push_batch(integer)') is not null as claim_push_batch`))[0];
  raw.rls=await query(`select c.relname as tabla,c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('fair_participants','follows','ratings','device_tokens','notification_consents','notifications') order by 1`);
  raw.shopColumns=await query(`select table_name,column_name from information_schema.columns where table_schema='public'
    and ((table_name='shops' and column_name in ('allow_ratings','contact_notifications','notify_from','notify_until')) or (table_name='public_shops' and column_name='allow_ratings')) order by 1,2`);
  raw.privileges=(await query(`select
    ${PRIVATE_TABLES.map(t=>`has_table_privilege('anon','public.${t}','SELECT') as anon_lee_${t}`).join(',\n    ')},
    has_table_privilege('anon','public.public_ratings','SELECT') as anon_lee_public_ratings,
    has_function_privilege('anon','public.follow_target(text,text,text)','EXECUTE') as anon_ejecuta_follow,
    has_function_privilege('anon','public.verify_buyer_identity(text)','EXECUTE') as anon_ejecuta_verify,
    has_function_privilege('anon','public.fair_public_detail(uuid)','EXECUTE') as anon_ejecuta_ficha,
    has_function_privilege('anon','public.admin_invite_participant(uuid,text,text)','EXECUTE') as anon_ejecuta_invitar,
    has_function_privilege('anon','public.respond_fair_invitation(uuid,boolean)','EXECUTE') as anon_ejecuta_responder,
    has_function_privilege('anon','public.my_fair_invitations()','EXECUTE') as anon_ejecuta_mis_ferias,
    has_function_privilege('authenticated','public.respond_fair_invitation(uuid,boolean)','EXECUTE') as auth_ejecuta_responder,
    has_function_privilege('authenticated','app_private.claim_push_batch(integer)','EXECUTE') as auth_ejecuta_cola,
    has_function_privilege('anon','app_private.verify_firebase_token(text)','EXECUTE') as anon_ejecuta_verificador`))[0];
  raw.firebase=(await query(`select (select count(*)::int from app_private.firebase_keys) as claves,
    (select value from app_private.settings where key='firebase_project_id') as proyecto`))[0];
  raw.apiFairDetailUnknown=slim(await api('/rest/v1/rpc/fair_public_detail',{method:'POST',body:{p_fair_id:ZERO}}));
  raw.apiFollowAnon=slim(await api('/rest/v1/rpc/follow_target',{method:'POST',body:{p_target_type:'shop',p_target_id:'x'}}));
  raw.apiVerifyGarbage=slim(await api('/rest/v1/rpc/verify_buyer_identity',{method:'POST',body:{p_token:'no.es.un-token'}}));
  raw.apiVerifyNone=slim(await api('/rest/v1/rpc/verify_buyer_identity',{method:'POST',body:{}}));
  raw.apiInviteAnon=slim(await api('/rest/v1/rpc/admin_invite_participant',{method:'POST',body:{p_fair_id:ZERO,p_shop_id:'x'}}));
  raw.apiRespondAnon=slim(await api('/rest/v1/rpc/respond_fair_invitation',{method:'POST',body:{p_fair_id:ZERO,p_participate:true}}));
  raw.apiPublicRatings=slim(await api('/rest/v1/public_ratings?select=shop_id,average,total&limit=3'));
  raw.apiPublicShops=slim(await api('/rest/v1/public_shops?select=id,allow_ratings&limit=5'));
  raw.apiTables={};
  for(const t of PRIVATE_TABLES)raw.apiTables[t]=slim(await api('/rest/v1/'+t+'?select=*&limit=1'));
  if(process.env.FIREBASE_TEST_ID_TOKEN)raw.apiVerifyReal=slim(await api('/rest/v1/rpc/verify_buyer_identity',{method:'POST',body:{p_token:process.env.FIREBASE_TEST_ID_TOKEN}}));
  raw.e2e=process.env.ENTREGA7_SIN_E2E?{skipped:'omitido por el usuario (ENTREGA7_SIN_E2E)'}:await runE2E();
  return raw;
}

const check=(id,description,ok,detail='')=>({id,description,ok:Boolean(ok),detail:String(detail)});
const rejected=r=>r&&!r.ok&&r.status>=400&&r.status<500;
const isArray=r=>r&&r.ok&&Array.isArray(r.data);

export function evaluate(raw) {
  const checks=[];
  for(const id of EXPECTED_MIGRATIONS)checks.push(check('MIG-'+id.slice(0,3),'Migracion '+id+' registrada en la instancia',raw.migrations.includes(id)));
  const o=raw.objects;
  checks.push(check('OBJ-tablas','Existen fair_participants, follows, ratings, device_tokens, notification_consents y notifications',
    o.fair_participants&&o.follows&&o.ratings&&o.device_tokens&&o.notification_consents&&o.notifications&&o.public_ratings,JSON.stringify(o)));
  checks.push(check('OBJ-funciones','Existen las funciones de identidad, seguidores, ferias, calificaciones y cola',
    o.verify_buyer_identity&&o.verify_firebase_token&&o.follow_target&&o.respond_fair_invitation&&o.fair_public_detail&&o.rate_target&&o.register_device&&o.admin_fair_checklist&&o.claim_push_batch));
  checks.push(check('RLS-on','RLS activo en las seis tablas nuevas',raw.rls.length===6&&raw.rls.every(r=>r.rls),JSON.stringify(raw.rls)));
  const cols=table=>raw.shopColumns.filter(c=>c.table_name===table).map(c=>c.column_name).sort().join(',');
  checks.push(check('COL-shops','shops tiene allow_ratings, contact_notifications y el horario; public_shops expone allow_ratings',
    cols('shops')==='allow_ratings,contact_notifications,notify_from,notify_until'&&cols('public_shops')==='allow_ratings',JSON.stringify(raw.shopColumns)));
  const p=raw.privileges;
  checks.push(check('PRIV-tablas','El visitante no lee ninguna tabla privada (seguidores, dispositivos, avisos, calificaciones, participantes)',
    PRIVATE_TABLES.every(t=>!p['anon_lee_'+t]),JSON.stringify(PRIVATE_TABLES.filter(t=>p['anon_lee_'+t]))));
  checks.push(check('PRIV-publico','El visitante lee los promedios publicos, la ficha de feria y puede identificarse con token',
    p.anon_lee_public_ratings&&p.anon_ejecuta_ficha&&p.anon_ejecuta_verify&&p.anon_ejecuta_follow));
  checks.push(check('PRIV-admin','Invitar, responder y ver mis ferias exigen sesion; la cola y el verificador no son publicos',
    !p.anon_ejecuta_invitar&&!p.anon_ejecuta_responder&&!p.anon_ejecuta_mis_ferias&&p.auth_ejecuta_responder&&!p.auth_ejecuta_cola&&!p.anon_ejecuta_verificador,JSON.stringify(p)));
  checks.push(check('FIREBASE-claves','La base tiene las claves publicas de Firebase y el proyecto configurado',raw.firebase.claves>0&&Boolean(raw.firebase.proyecto),
    raw.firebase.claves+' clave(s), proyecto '+raw.firebase.proyecto+(raw.firebase.claves>0?'':' -> ejecutar: node supabase/tools/fcm-worker.mjs keys')));
  const detail=raw.apiFairDetailUnknown;
  checks.push(check('API-ficha-inexistente','La ficha publica de una feria inexistente responde vacia, sin error',detail.ok&&detail.data===null,'HTTP '+detail.status));
  checks.push(check('API-seguir-sin-sesion','Sin sesion ni token, seguir se rechaza (la app pide iniciar sesion)',rejected(raw.apiFollowAnon),'HTTP '+raw.apiFollowAnon.status));
  checks.push(check('API-token-invalido','Un token de Google falso o ausente se rechaza',rejected(raw.apiVerifyGarbage)&&rejected(raw.apiVerifyNone),'HTTP '+raw.apiVerifyGarbage.status+' / '+raw.apiVerifyNone.status));
  checks.push(check('API-admin-anon','Sin sesion, invitar y responder a ferias se rechazan',rejected(raw.apiInviteAnon)&&rejected(raw.apiRespondAnon),'HTTP '+raw.apiInviteAnon.status+' / '+raw.apiRespondAnon.status));
  checks.push(check('API-tablas-privadas','Sin sesion, ninguna tabla privada se puede leer por la API',PRIVATE_TABLES.every(t=>rejected(raw.apiTables[t])),
    PRIVATE_TABLES.map(t=>t+':'+raw.apiTables[t].status).join(' ')));
  checks.push(check('API-public_ratings','public_ratings responde sin sesion y solo con promedios',isArray(raw.apiPublicRatings)&&raw.apiPublicRatings.data.every(r=>Object.keys(r).sort().join()==='average,shop_id,total'),'HTTP '+raw.apiPublicRatings.status));
  checks.push(check('API-public_shops','public_shops informa si la tienda acepta calificaciones',isArray(raw.apiPublicShops)&&raw.apiPublicShops.data.every(r=>typeof r.allow_ratings==='boolean'),'HTTP '+raw.apiPublicShops.status));
  if(raw.apiVerifyReal)checks.push(check('API-google-real','El ID token real de Google se valida en el servidor',raw.apiVerifyReal.ok&&/^firebase:/.test(raw.apiVerifyReal.data?.subject??''),
    raw.apiVerifyReal.ok?'identidad '+raw.apiVerifyReal.data.subject:'HTTP '+raw.apiVerifyReal.status+' '+JSON.stringify(raw.apiVerifyReal.data).slice(0,160)));
  if(raw.e2e?.result)for(const [id,ok] of Object.entries(raw.e2e.result))checks.push(check('E2E-'+id,'Recorrido real (se deshace): '+id.replaceAll('_',' '),ok===true));
  else if(raw.e2e?.error)checks.push(check('E2E','Recorrido de extremo a extremo (se deshace al terminar)',false,raw.e2e.error.slice(0,300)));
  return checks;
}

export function notes(raw) {
  const out=[];
  if(raw.e2e?.skipped)out.push('Recorrido E2E omitido: '+raw.e2e.skipped+'.');
  if(!raw.apiVerifyReal)out.push('No se probo un ID token real de Google. Para hacerlo: copia un token vigente desde la app y ejecuta con FIREBASE_TEST_ID_TOKEN.');
  if(Array.isArray(raw.apiPublicShops?.data)&&raw.apiPublicShops.data.length===0)out.push('No hay tiendas publicas todavia.');
  return out;
}

async function main() {
  const config=settings();
  if(new URL(config.url).hostname!=='supabase-surcode.codepulse.cl')throw new Error('Revisar la instancia exclusiva de SurCode');
  const raw=await gather();
  const checks=evaluate(raw);
  const failed=checks.filter(c=>!c.ok);
  const report={checkedAt:new Date().toISOString(),instance:config.url,entrega:7,
    summary:{total:checks.length,passed:checks.length-failed.length,failed:failed.length},
    migrationsRegistered:raw.migrations,firebaseKeys:raw.firebase.claves,checks,notes:notes(raw),
    limits:['El recorrido E2E usa las cuentas existentes dentro de una transaccion que se deshace siempre: no deja ferias, avisos ni calificaciones.',
      'La entrega real de un push a un telefono depende del servicio fcm-worker y de la configuracion Firebase de la app; esta verificacion no envia ninguno.',
      'Las respuestas de la API se comprobaron con la clave anon, sin sesion.']};
  const output=new URL('../../security/reports/entrega7-backend/',import.meta.url);
  mkdirSync(output,{recursive:true});
  writeFileSync(new URL('estado-servidor.json',output),JSON.stringify(report,null,2)+'\n');
  for(const c of checks)console.log((c.ok?'OK     ':'FALLA  ')+c.id.padEnd(40)+c.description+(c.ok||!c.detail?'':'  -> '+c.detail));
  for(const n of report.notes)console.log('AVISO  '+n);
  console.log('\n'+report.summary.passed+' de '+report.summary.total+' comprobaciones correctas.');
  if(failed.length)process.exitCode=1;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{await main();}catch(error){console.error(error.message);process.exitCode=1;}
}
