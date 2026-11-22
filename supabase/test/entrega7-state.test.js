// Verificacion del servidor de la entrega 7: decide cumple / no cumple con datos de ejemplo, sin red.
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,notes,runE2E,EXPECTED_MIGRATIONS} from '../tools/entrega7-state.mjs';

const ok=data=>({status:200,ok:true,data});const no=status=>({status,ok:false,data:{}});
const tables=['follows','device_tokens','notifications','notification_consents','ratings','fair_participants'];
function good() {
  return {
    migrations:['001_conectasur',...EXPECTED_MIGRATIONS],
    objects:Object.fromEntries(['fair_participants','follows','ratings','device_tokens','notification_consents','notifications','public_ratings','verify_buyer_identity','verify_firebase_token',
      'follow_target','respond_fair_invitation','fair_public_detail','rate_target','register_device','admin_fair_checklist','claim_push_batch'].map(k=>[k,true])),
    rls:tables.map(t=>({tabla:t,rls:true})),
    shopColumns:[...['allow_ratings','contact_notifications','notify_from','notify_until'].map(c=>({table_name:'shops',column_name:c})),{table_name:'public_shops',column_name:'allow_ratings'}],
    privileges:{...Object.fromEntries(tables.map(t=>['anon_lee_'+t,false])),anon_lee_public_ratings:true,anon_ejecuta_follow:true,anon_ejecuta_verify:true,anon_ejecuta_ficha:true,
      anon_ejecuta_invitar:false,anon_ejecuta_responder:false,anon_ejecuta_mis_ferias:false,auth_ejecuta_responder:true,auth_ejecuta_cola:false,anon_ejecuta_verificador:false},
    firebase:{claves:2,proyecto:'conectasur-dev'},
    apiFairDetailUnknown:ok(null),apiFollowAnon:no(403),apiVerifyGarbage:no(403),apiVerifyNone:no(403),apiInviteAnon:no(401),apiRespondAnon:no(401),
    apiPublicRatings:ok([{shop_id:'a',average:'4.50',total:2}]),apiPublicShops:ok([{id:'a',allow_ratings:true}]),
    apiTables:Object.fromEntries(tables.map(t=>[t,no(401)])),
    e2e:{result:{A02_participo_con_un_toque:true,W07_checklist_confirmada:true}},
  };
}
describe('verificacion de la entrega 7',()=>{
  it('todo correcto: ninguna comprobacion falla',()=>{const checks=evaluate(good());assert.ok(checks.length>=15);assert.deepEqual(checks.filter(c=>!c.ok),[]);});
  it('detecta migraciones faltantes, tablas legibles por el visitante y claves ausentes',()=>{
    const raw=good();raw.migrations=['001_conectasur'];raw.privileges.anon_lee_follows=true;raw.firebase.claves=0;raw.apiTables.device_tokens=ok([{}]);
    const failed=evaluate(raw).filter(c=>!c.ok).map(c=>c.id);
    for(const id of ['MIG-012','MIG-013','MIG-014','PRIV-tablas','FIREBASE-claves','API-tablas-privadas'])assert.ok(failed.includes(id),id);
  });
  it('un token falso aceptado o un E2E con un paso en falso se marcan como fallo',()=>{
    const raw=good();raw.apiVerifyGarbage=ok({subject:'x'});raw.e2e={result:{A13_aviso_al_seguidor:false}};
    const failed=evaluate(raw).filter(c=>!c.ok).map(c=>c.id);assert.ok(failed.includes('API-token-invalido'));assert.ok(failed.includes('E2E-A13_aviso_al_seguidor'));
  });
  it('el token real de Google solo se comprueba si se entrega',()=>{
    assert.equal(evaluate(good()).some(c=>c.id==='API-google-real'),false);assert.ok(notes(good()).some(n=>/ID token real/.test(n)));
    const raw=good();raw.apiVerifyReal=ok({subject:'firebase:abc',provider:'firebase_google'});assert.equal(evaluate(raw).find(c=>c.id==='API-google-real').ok,true);
    raw.apiVerifyReal=no(403);assert.equal(evaluate(raw).find(c=>c.id==='API-google-real').ok,false);
  });
  it('interpreta el resultado, la omision y los errores del recorrido E2E',async()=>{
    const fail=message=>async()=>{throw new Error(message)};
    assert.deepEqual(await runE2E({run:fail('Studio SQL: E2E_RESULT:{"a": true, "b": false}\nCONTEXT: PL/pgSQL')}),{result:{a:true,b:false}});
    assert.match((await runE2E({run:fail('Studio SQL: E2E_SKIP:faltan dos tiendas')})).skipped,/dos tiendas/);
    assert.match((await runE2E({run:fail('Studio SQL: permission denied for table fairs')})).error,/permission denied/);
    assert.ok((await runE2E({run:async()=>[]})).error);
  });
});
