// Ejecutar después de assembleDebug y assembleDebugAndroidTest, con un emulador conectado.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const c = settings(), admin = createDataLayer({ url: c.url, anonKey: c.anonKey });
const email = `android_session_${randomUUID()}@demo.conectasur.cl`;
const password = randomBytes(24).toString('base64url');
const adb = process.env.ADB_EXE || 'C:/Users/tampi/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const device = process.env.ANDROID_SERIAL || 'emulator-5554';
const store = 'session_persistence_test_' + randomUUID().replaceAll('-', '');
let fixture;
function run(args) {
  // No incluir los argumentos ni credenciales en errores del proceso.
  const result = spawnSync(adb, ['-s', device, ...args], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  if (result.status !== 0 || result.error) throw new Error('Falló la ejecución Android: ' + output.replaceAll(password, '[oculto]').slice(-1500));
  return output;
}
try {
  assert.equal(run(['shell', 'getprop', 'sys.boot_completed']).trim(), '1');
  run(['install', '-r', fileURLToPath(new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url))]);
  run(['install', '-r', fileURLToPath(new URL('../android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk', import.meta.url))]);
  await admin.login(c.accounts.admin.email, c.accounts.admin.password);
  fixture = await admin.createEmprendedora({ email, password, displayName: 'Prueba sesión Android', shopName: 'Tienda sesión Android (prueba)' });
  const common = ['shell', 'am', 'instrument', '-w', '-r', '-e', 'class', 'cl.surcode.conectasur.SessionPersistenceTest', '-e', 'sessionStore', store, '-e', 'testUid', fixture.uid];
  function phase(name, credentials = []) {
    const text = run([...common, '-e', 'sessionPhase', name, ...credentials, 'cl.surcode.conectasur.test/androidx.test.runner.AndroidJUnitRunner']);
    assert.ok(text.includes('OK (1 test)'), 'La fase Android no terminó correctamente: ' + text.replaceAll(password, '[oculto]').slice(-1500));
  }
  phase('sign-in', ['-e', 'testEmail', email, '-e', 'testPassword', password]);
  run(['shell', 'am', 'force-stop', 'cl.surcode.conectasur']);
  phase('restore');
  const checks = [
    'Ingreso real guarda la sesión en el almacén cifrado de Android',
    'Después de force-stop, otro proceso recupera el mismo usuario sin contraseña',
    'Un StoreViewModel nuevo recupera la sesión y tienda desde el repositorio real',
    'Token vencido se renueva contra Supabase sin pedir otra contraseña',
    'Cerrar sesión impide que un cliente nuevo recupere el acceso'
  ];
  mkdirSync(new URL('./reports/session-persistence/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./reports/session-persistence/android.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), passed: checks.length, checks,
    phases: 2, environment: 'Emulador Pixel 7 API 36; dos procesos separados con force-stop; Supabase real',
    limits: ['Sin prueba física de teléfono', 'Almacén y cuenta temporales propios; la prueba no reemplaza la sesión personal del emulador'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  try {
    if (fixture) await query(`begin;
      delete from public.shop_associations where shop_id=${literal(fixture.shopId)};
      update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};
      delete from public.shops where id=${literal(fixture.shopId)};
      delete from auth.users where id=${literal(fixture.uid)};commit;`);
  } finally { await admin.logout().catch(() => {}); await admin.dispose(); }
}
