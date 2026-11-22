// Servicio de envio push (FCM HTTP v1) y sincronizacion de las claves de Firebase.
// Entrega 7. Sin dependencias: usa fetch y crypto de Node. Se ejecuta solo en el equipo de desarrollo,
// con las mismas credenciales privadas de Studio que tools/admin.mjs. Nunca va en Android ni en la web.
//
//   node supabase/tools/fcm-worker.mjs keys     Descarga las claves publicas de Firebase hacia la base
//   node supabase/tools/fcm-worker.mjs project <id>  Fija el ID del proyecto Firebase que la base acepta en los tokens de Google
//   node supabase/tools/fcm-worker.mjs check    Prueba la cuenta de servicio contra FCM (no envia nada)
//   node supabase/tools/fcm-worker.mjs once     Envia lo pendiente y termina
//   node supabase/tools/fcm-worker.mjs watch    Envia en bucle (--interval=5 segundos); Ctrl+C para salir
//   agregar --dry-run para listar lo pendiente sin enviar ni marcar nada
//
// Cuenta de servicio: Firebase > Configuracion del proyecto > Cuentas de servicio > Generar clave privada.
// Guardar el JSON fuera del repositorio e indicarlo en FCM_SERVICE_ACCOUNT_FILE. No se sube a Git.
import {readFileSync} from 'node:fs';
import {createSign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {query,literal} from './admin.mjs';

export const JWKS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SCOPE='https://www.googleapis.com/auth/firebase.messaging';
const b64url=value=>Buffer.from(value).toString('base64url');
const asJson=value=>typeof value==='string'?JSON.parse(value):value;

// --- Claves de Firebase (para que la base verifique los tokens de Google) ---
export async function syncFirebaseKeys({run=query,fetchImpl=fetch}={}) {
  const response=await fetchImpl(JWKS_URL,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('No se pudieron descargar las claves de Firebase ('+response.status+')');
  const body=await response.json();
  const keys=(body.keys??[]).filter(k=>k.kty==='RSA'&&k.kid&&k.n&&k.e);
  if(!keys.length)throw new Error('Google no entrego claves RSA');
  await run('select app_private.sync_firebase_keys('+literal(JSON.stringify(keys))+'::jsonb)');
  const maxAge=Number(/max-age=(\d+)/.exec(response.headers?.get?.('cache-control')??'')?.[1]??3600);
  return {count:keys.length,maxAge:Math.max(300,Math.min(maxAge,6*3600))};
}

export async function setFirebaseProject(id,{run=query}={}) {
  if(!/^[a-z][a-z0-9-]{4,29}$/.test(id??''))throw new Error('ID de proyecto Firebase invalido: '+id);
  await run('update app_private.settings set value='+literal(id)+" where key='firebase_project_id'");
}

// --- Cuenta de servicio y token OAuth ---
export function serviceAccountJwt(account,nowMs=Date.now()) {
  const iat=Math.floor(nowMs/1000);
  const unsigned=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64url(JSON.stringify({
    iss:account.client_email,scope:SCOPE,aud:account.token_uri??'https://oauth2.googleapis.com/token',iat,exp:iat+3600}));
  return unsigned+'.'+createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
}
export function createFcmClient({account,fetchImpl=fetch,now=()=>Date.now()}) {
  if(!account?.client_email||!account?.private_key||!account?.project_id)throw new Error('La cuenta de servicio no tiene client_email, private_key y project_id');
  let cached=null;
  async function accessToken() {
    if(cached&&cached.expires>now()+60000)return cached.value;
    const response=await fetchImpl(account.token_uri??'https://oauth2.googleapis.com/token',{method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(20000),
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:serviceAccountJwt(account,now())})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.access_token)throw Object.assign(new Error('Google rechazo la cuenta de servicio: '+(data.error_description??data.error??response.status)),{fatal:true});
    cached={value:data.access_token,expires:now()+(Number(data.expires_in)||3600)*1000};
    return cached.value;
  }
  return {
    projectId:account.project_id,
    // Devuelve {ok} o {ok:false,permanent,error}. "permanent" = el dispositivo ya no sirve y se descarta.
    async send(message,{validateOnly=false}={}) {
      const response=await fetchImpl('https://fcm.googleapis.com/v1/projects/'+account.project_id+'/messages:send',{method:'POST',
        headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
        body:JSON.stringify({validate_only:validateOnly,message})});
      if(response.ok)return {ok:true};
      const data=await response.json().catch(()=>({}));
      const status=data.error?.status??'';const detail=JSON.stringify(data.error?.details??[]);
      const text=(data.error?.message??response.status)+' ['+status+']';
      if(response.status===404||status==='NOT_FOUND'||/UNREGISTERED/.test(detail))return {ok:false,permanent:true,error:text};
      if(response.status===400&&status==='INVALID_ARGUMENT'&&/token/i.test(data.error?.message??''))return {ok:false,permanent:true,error:text};
      if(response.status===401||response.status===403)throw Object.assign(new Error('FCM rechazo las credenciales ('+response.status+'): '+text),{fatal:true});
      return {ok:false,permanent:false,error:text};
    },
  };
}
export function buildMessage(item,device,webUrl='https://conectasur-dev.web.app') {
  const data=Object.fromEntries(Object.entries({...item.data,kind:item.kind,notification_id:item.id}).map(([k,v])=>[k,String(v)]));
  return {token:device.token,notification:{title:item.title,body:item.body},data,
    android:{priority:'HIGH'},webpush:{fcm_options:{link:webUrl}}};
}

// --- Cola: una pasada completa ---
export async function processBatch({run=query,fcm,webUrl,log=()=>{},limit=20}) {
  const rows=await run('select app_private.claim_push_batch('+Number(limit)+') as b');
  const batch=asJson(rows[0]?.b)??[];
  const summary={claimed:batch.length,sent:0,failed:0,dropped:0};
  for(const item of batch) {
    let delivered=0,transient=null;
    for(const device of item.tokens??[]) {
      const result=await fcm.send(buildMessage(item,device,webUrl));
      if(result.ok){delivered++;summary.sent++;continue;}
      if(result.permanent){summary.dropped++;await run('select app_private.drop_device('+literal(device.token)+')');log('dispositivo descartado: '+result.error);continue;}
      transient=result.error;summary.failed++;
    }
    // Entregado a alguno, o todos los dispositivos eran invalidos: se cierra. Si hubo fallos temporales, se reintenta.
    if(delivered>0||!transient)await run('select app_private.finish_push('+literal(item.id)+'::uuid,true)');
    else await run('select app_private.finish_push('+literal(item.id)+'::uuid,false,'+literal(transient)+')');
    log((delivered>0?'enviado':transient?'reintentara':'sin dispositivos validos')+': '+item.kind+' - '+item.title);
  }
  return summary;
}
export async function listPending({run=query}={}) {
  return run("select kind,title,subject,created_at from public.notifications where push_sent_at is null order by created_at limit 50");
}

// --- Linea de comandos ---
function loadAccount() {
  const file=process.env.FCM_SERVICE_ACCOUNT_FILE;
  if(!file)throw new Error('Define FCM_SERVICE_ACCOUNT_FILE con la ruta del JSON de la cuenta de servicio (fuera del repositorio)');
  return JSON.parse(readFileSync(file,'utf8'));
}
async function main(argv) {
  const [command,...flags]=argv;const has=name=>flags.includes(name);
  const interval=Number((flags.find(f=>f.startsWith('--interval='))??'--interval=5').split('=')[1])||5;
  const log=text=>console.log(new Date().toLocaleTimeString('es-CL')+'  '+text);
  if(command==='project'){await setFirebaseProject(flags[0]);console.log('Proyecto Firebase de la base: '+flags[0]);return;}
  if(command==='keys'){const r=await syncFirebaseKeys();console.log('Claves de Firebase sincronizadas: '+r.count+' (vigencia sugerida '+r.maxAge+' s)');return;}
  if(command==='once'&&has('--dry-run')||command==='watch'&&has('--dry-run')){
    const rows=await listPending();console.log(rows.length+' aviso(s) pendiente(s) de envio (no se envia ni se marca nada).');
    for(const r of rows)console.log('- '+r.kind+': '+r.title);return;}
  if(!['check','once','watch'].includes(command))throw new Error('Usar: keys | project <id> | check | once | watch [--dry-run] [--interval=5]');
  const account=loadAccount();const fcm=createFcmClient({account});
  const configured=(await query("select value from app_private.settings where key='firebase_project_id'"))[0]?.value;
  if(configured&&configured!==account.project_id)console.warn('AVISO: la cuenta de servicio es del proyecto '+account.project_id+' pero la base valida tokens de '+configured+'.');
  if(command==='check'){
    // validate_only no entrega nada: un token inventado debe dar INVALID_ARGUMENT si las credenciales son correctas.
    const r=await fcm.send({token:'x'.repeat(40)},{validateOnly:true});
    console.log('Cuenta de servicio aceptada por FCM (proyecto '+account.project_id+'). '+(r.ok?'':'Respuesta esperada para un token de prueba: '+r.error));return;}
  const webUrl=process.env.CONECTASUR_WEB_URL||undefined;
  let nextKeys=0;
  const pass=async()=>{
    if(Date.now()>=nextKeys){try{const k=await syncFirebaseKeys();nextKeys=Date.now()+k.maxAge*1000;log('claves de Firebase al dia ('+k.count+')');}catch(e){nextKeys=Date.now()+60000;log('no se pudieron actualizar las claves: '+e.message);}}
    const s=await processBatch({fcm,webUrl,log});
    if(s.claimed)log('pasada: '+s.claimed+' aviso(s), '+s.sent+' envio(s), '+s.failed+' fallo(s) temporal(es), '+s.dropped+' dispositivo(s) descartado(s)');
  };
  if(command==='once'){await pass();return;}
  console.log('Servicio push activo cada '+interval+' s. Ctrl+C para detenerlo.');
  let stop=false;process.on('SIGINT',()=>{stop=true;console.log('\nDeteniendo...');});
  while(!stop){
    try{await pass();}catch(e){log('error: '+e.message);if(e.fatal){process.exitCode=1;return;}}
    await new Promise(resolve=>setTimeout(resolve,interval*1000));
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
