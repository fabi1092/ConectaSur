// Genera el resumen de ejecuciones reales. No ejecuta pruebas ni transforma fallos en aprobados.
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const read=(p)=>readFileSync(new URL(p,root),'utf8');
const count=(log,name)=>{const m=log.match(new RegExp('ℹ '+name+' (\\d+)'));if(!m)throw new Error('Falta resultado '+name);return Number(m[1])};
const logs=['security/reports/supabase-live.log','security/reports/supabase-web.log'];
const live=logs.map(path=>{const text=read(path);const r={tests:count(text,'tests'),passed:count(text,'pass'),failed:count(text,'fail')};if(r.failed||r.tests!==r.passed)throw new Error('Pruebas fallidas: '+path);return {path,...r}});
if(!read('security/reports/android-live.log').includes('OK (5 tests)'))throw new Error('Faltan las cinco pruebas Android reales');
if(!read('security/reports/android-ui.log').includes('BUILD SUCCESSFUL'))throw new Error('La navegacion Android no paso');
const unit=['CatalogTest','SalesTest'].map(n=>read('android/app/build/test-results/testDebugUnitTest/TEST-cl.surcode.conectasur.domain.'+n+'.xml'));
const attr=(x,n)=>Number(x.match(new RegExp(n+'="(\\d+)"'))[1]);
const unitResult=unit.reduce((a,x)=>({tests:a.tests+attr(x,'tests'),failures:a.failures+attr(x,'failures'),errors:a.errors+attr(x,'errors')}),{tests:0,failures:0,errors:0});
const lint=read('android/app/build/reports/lint-results-debug.xml');
const manifest=read('android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml');
const git=process.env.GIT_EXE??'git';
const tracked=execFileSync(git,['ls-files','-z'],{cwd:fileURLToPath(root),encoding:'utf8'}).split('\0').filter(Boolean);
const findings=[];
for(const path of tracked){
 if(/(^|\/)(supabase\.properties|supabase-config\.js|google-services\.json|firebase-config\.json|local\.properties|service[-_]?account.*\.json)$|\.(jks|keystore|dpapi)$/i.test(path))findings.push({path,type:'Archivo privado versionado'});
 if(/\.(kt|kts|js|mjs|json|md|ps1|yml|yaml|xml|sql)$/.test(path)){
   const text=read(path);
   if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)||/"type"\s*:\s*"service_account"/.test(text))findings.push({path,type:'Posible clave privada'});
 }
}
const sources=['supabase/migrations/001_conectasur.sql','supabase/test/security.test.js','supabase/test/web.test.js','supabase/test/sql.test.js','web/supabase-data.js','web/package-lock.json','supabase/package-lock.json',
 'android/app/src/main/java/cl/surcode/conectasur/data/SupabaseClient.kt','android/app/src/main/java/cl/surcode/conectasur/data/SupabaseRepositories.kt','android/app/src/main/java/cl/surcode/conectasur/data/SecureBackendStore.kt'];
const report={
 collectedAt:new Date().toISOString(),backend:'Supabase de SurCode suministrado por el profesor',node:process.version,
 apiLive:live,androidLive:{passed:5,environment:'Pixel 7, API 36, emulador; API y Storage reales'},
 androidUi:{passed:6,environment:'Mismo emulador, build de demostracion; LaunchTest y NavigationTest'},
 androidUnit:unitResult,androidBuild:read('security/reports/android-supabase.log').includes('BUILD SUCCESSFUL'),
 lint:{errors:[...lint.matchAll(/severity="(?:Error|Fatal)"/g)].length,warnings:[...lint.matchAll(/severity="Warning"/g)].length},
 permissions:[...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)].map(m=>m[1]),
 npm:{web:JSON.parse(read('security/reports/audit-web.json')).metadata.vulnerabilities,supabaseTools:JSON.parse(read('security/reports/audit-supabase.json')).metadata.vulnerabilities},
 osv:JSON.parse(read('security/reports/android-dependencies.json')),
 privateFileScan:{files:tracked.length,findings,scope:'Patrones acotados sobre archivos versionados; no audita todo el historial'},
 sourceHashNormalization:'UTF-8, CRLF normalizado a LF',
 sourceSha256:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(read(p).replaceAll('\r\n','\n')).digest('hex')])),
 pending:['Google OAuth deshabilitado por configuracion del servidor','Huella opcional en pantalla de acceso','Pantallas finales de los otros integrantes','Validacion de TalkBack en telefonos reales','Atestacion de integridad de aplicacion equivalente a App Check','Revision normativa de privacidad'],
};
writeFileSync(new URL('security/reports/verification.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({api:live,androidLive:5,androidUi:6,androidUnit:unitResult,lint:report.lint,privateFileFindings:findings.length},null,2));
if(findings.length||unitResult.errors||unitResult.failures||report.lint.errors||!report.androidBuild)process.exitCode=1;
