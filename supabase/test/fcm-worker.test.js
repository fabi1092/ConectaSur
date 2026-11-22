// Servicio de envio push: firma de la cuenta de servicio, clasificacion de errores de FCM y cola, sin red ni credenciales reales.
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {serviceAccountJwt,createFcmClient,buildMessage,processBatch,syncFirebaseKeys,setFirebaseProject} from '../tools/fcm-worker.mjs';

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const account={client_email:'push@conectasur-dev.iam.gserviceaccount.com',project_id:'conectasur-dev',
  private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://oauth2.googleapis.com/token'};
const json=(status,body,headers={})=>({ok:status<400,status,headers:{get:name=>headers[name.toLowerCase()]??null},json:async()=>body});

function fakeFetch(fcmReply) {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.startsWith('https://oauth2.googleapis.com'))return json(200,{access_token:'tok-'+calls.length,expires_in:3600});
    return fcmReply(JSON.parse(options.body).message,calls);
  };
  return {fetchImpl,calls};
}
const item=(id,tokens)=>({id,kind:'invitation',title:'Te invitaron a una feria: Feria Sur',body:'Plaza',data:{fair_id:'f1',fair_name:'Feria Sur',n:7},tokens});

describe('cuenta de servicio y cliente FCM',()=>{
  it('firma el JWT de la cuenta de servicio con RS256 y alcance de mensajeria',()=>{
    const jwt=serviceAccountJwt(account,1_700_000_000_000);const [h,p,s]=jwt.split('.');
    assert.equal(JSON.parse(Buffer.from(h,'base64url')).alg,'RS256');
    const claims=JSON.parse(Buffer.from(p,'base64url'));
    assert.equal(claims.iss,account.client_email);assert.equal(claims.exp-claims.iat,3600);assert.match(claims.scope,/firebase\.messaging/);
    assert.ok(createVerify('RSA-SHA256').update(h+'.'+p).verify(publicKey,Buffer.from(s,'base64url')));
  });
  it('pide el token OAuth una vez y lo reutiliza',async()=>{
    const {fetchImpl,calls}=fakeFetch(()=>json(200,{name:'ok'}));const fcm=createFcmClient({account,fetchImpl});
    await fcm.send({token:'a'});await fcm.send({token:'b'});
    assert.equal(calls.filter(c=>c.url.includes('oauth2')).length,1);
    assert.match(calls.at(-1).url,/projects\/conectasur-dev\/messages:send$/);assert.equal(calls.at(-1).options.headers.Authorization,'Bearer tok-1');
  });
  it('clasifica errores: dispositivo invalido es permanente, 5xx temporal, 401 fatal',async()=>{
    const cases=[[404,{error:{status:'NOT_FOUND',message:'Requested entity was not found.'}},true],
      [400,{error:{status:'INVALID_ARGUMENT',message:'The registration token is not a valid FCM registration token'}},true],
      [503,{error:{status:'UNAVAILABLE',message:'try later'}},false],[429,{error:{status:'RESOURCE_EXHAUSTED',message:'cuota'}},false]];
    for(const [code,body,permanent] of cases){
      const {fetchImpl}=fakeFetch(()=>json(code,body));const r=await createFcmClient({account,fetchImpl}).send({token:'t'});
      assert.equal(r.ok,false,String(code));assert.equal(r.permanent,permanent,String(code));
    }
    const {fetchImpl}=fakeFetch(()=>json(403,{error:{status:'PERMISSION_DENIED',message:'API desactivada'}}));
    await assert.rejects(createFcmClient({account,fetchImpl}).send({token:'t'}),e=>e.fatal===true&&/credenciales/.test(e.message));
  });
  it('rechaza una cuenta de servicio incompleta y una OAuth denegada',async()=>{
    assert.throws(()=>createFcmClient({account:{project_id:'x'}}),/client_email/);
    const fetchImpl=async()=>json(400,{error:'invalid_grant',error_description:'Invalid JWT Signature.'});
    await assert.rejects(createFcmClient({account,fetchImpl}).send({token:'t'}),e=>e.fatal&&/Invalid JWT/.test(e.message));
  });
  it('el mensaje lleva titulo, cuerpo y datos como texto con el nombre de la feria',()=>{
    const m=buildMessage(item('n1',[]),{token:'tok'});
    assert.equal(m.token,'tok');assert.equal(m.notification.title,'Te invitaron a una feria: Feria Sur');
    assert.equal(m.data.fair_name,'Feria Sur');assert.equal(m.data.n,'7');assert.equal(m.data.kind,'invitation');assert.equal(m.data.notification_id,'n1');
    assert.ok(Object.values(m.data).every(v=>typeof v==='string'));
  });
});

describe('cola de avisos',()=>{
  function db(batch) {
    const sqls=[];
    const run=async sql=>{sqls.push(sql);return sql.includes('claim_push_batch')?[{b:JSON.stringify(batch)}]:[];};
    return {run,sqls};
  }
  it('envia a todos los dispositivos y cierra el aviso',async()=>{
    const {run,sqls}=db([item('11111111-1111-1111-1111-111111111111',[{token:'t1',platform:'android'},{token:'t2',platform:'web'}])]);
    const {fetchImpl}=fakeFetch(()=>json(200,{name:'m'}));
    const s=await processBatch({run,fcm:createFcmClient({account,fetchImpl})});
    assert.deepEqual(s,{claimed:1,sent:2,failed:0,dropped:0});
    assert.ok(sqls.some(q=>/finish_push\('11111111-1111-1111-1111-111111111111'::uuid,true\)/.test(q)));
  });
  it('descarta un dispositivo desinstalado y entrega al resto',async()=>{
    const {run,sqls}=db([item('22222222-2222-2222-2222-222222222222',[{token:'viejo',platform:'android'},{token:'nuevo',platform:'android'}])]);
    const {fetchImpl}=fakeFetch(m=>m.token==='viejo'?json(404,{error:{status:'NOT_FOUND',message:'x'}}):json(200,{}));
    const s=await processBatch({run,fcm:createFcmClient({account,fetchImpl})});
    assert.equal(s.sent,1);assert.equal(s.dropped,1);
    assert.ok(sqls.some(q=>q.includes("drop_device('viejo')")));assert.ok(sqls.some(q=>/finish_push\('2{8}-.*,true\)/.test(q)));
  });
  it('un fallo temporal deja el aviso para reintentar y no lo cierra',async()=>{
    const {run,sqls}=db([item('33333333-3333-3333-3333-333333333333',[{token:'t',platform:'android'}])]);
    const {fetchImpl}=fakeFetch(()=>json(503,{error:{status:'UNAVAILABLE',message:'ocupado'}}));
    const s=await processBatch({run,fcm:createFcmClient({account,fetchImpl})});
    assert.equal(s.failed,1);assert.equal(s.sent,0);
    assert.ok(sqls.some(q=>/finish_push\('3{8}-.*,false,'ocupado \[UNAVAILABLE\]'\)/.test(q)));
  });
  it('una credencial rechazada detiene la pasada sin cerrar los avisos',async()=>{
    const {run,sqls}=db([item('44444444-4444-4444-4444-444444444444',[{token:'t',platform:'android'}])]);
    const {fetchImpl}=fakeFetch(()=>json(401,{error:{status:'UNAUTHENTICATED',message:'bad'}}));
    await assert.rejects(processBatch({run,fcm:createFcmClient({account,fetchImpl})}),e=>e.fatal);
    assert.equal(sqls.filter(q=>q.includes('finish_push')).length,0);
  });
  it('una cola vacia no llama a FCM',async()=>{
    const {run}=db([]);const {fetchImpl,calls}=fakeFetch(()=>json(200,{}));
    assert.deepEqual(await processBatch({run,fcm:createFcmClient({account,fetchImpl})}),{claimed:0,sent:0,failed:0,dropped:0});assert.equal(calls.length,0);
  });
});

describe('claves de Firebase',()=>{
  it('descarta lo que no es RSA y envia las claves a la base',async()=>{
    const sent=[];const fetchImpl=async()=>json(200,{keys:[{kty:'RSA',kid:'k1',n:'n1',e:'AQAB'},{kty:'EC',kid:'k2'},{kty:'RSA',kid:'k3',n:'n3',e:'AQAB'}]},{'cache-control':'public, max-age=99999'});
    const r=await syncFirebaseKeys({run:async sql=>{sent.push(sql)},fetchImpl});
    assert.equal(r.count,2);assert.equal(r.maxAge,6*3600);
    assert.match(sent[0],/sync_firebase_keys\('.*"kid":"k1".*"kid":"k3".*'::jsonb\)/);assert.equal(sent[0].includes('"k2"'),false);
  });
  it('falla con claridad si Google no responde o no entrega claves',async()=>{
    await assert.rejects(syncFirebaseKeys({run:async()=>{},fetchImpl:async()=>json(500,{})}),/No se pudieron/);
    await assert.rejects(syncFirebaseKeys({run:async()=>{},fetchImpl:async()=>json(200,{keys:[]})}),/no entrego/);
  });
});

describe('proyecto de Firebase',()=>{
  it('fija el ID del proyecto y rechaza valores invalidos o con intento de inyeccion',async()=>{
    const sent=[];await setFirebaseProject('conectasur-dev',{run:async sql=>{sent.push(sql)}});
    assert.match(sent[0],/update app_private\.settings set value='conectasur-dev' where key='firebase_project_id'/);
    for(const bad of [undefined,'','AB',"x'; drop table y;--",'Conecta Sur','a'.repeat(40)])await assert.rejects(setFirebaseProject(bad,{run:async()=>{}}),/invalido/);
  });
});
