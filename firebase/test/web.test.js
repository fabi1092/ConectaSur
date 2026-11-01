// Prueba la capa web REAL contra Authentication y Firestore emulados.
// No representa una prueba de navegador ni del panel visual de Kisho.
import assert from 'node:assert/strict';
import { before, beforeEach, after, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from '../../web/node_modules/firebase/app/dist/esm/index.esm.js';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut,
} from '../../web/node_modules/firebase/auth/dist/esm/index.esm.js';
import {
  connectFirestoreEmulator, doc, getDoc, terminate,
} from '../../web/node_modules/firebase/firestore/dist/esm/index.esm.js';

let env, web, app, secondary;
const projectId = 'demo-conectasur';
const email = 'cuenta@conectasur.example';
const password = 'Solo-Pruebas-2026';

before(async () => {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Solo ejecutar en emuladores');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Solo ejecutar en emuladores');
  const config = { projectId, apiKey: 'demo-api-key', appId: 'demo-app' };
  app = initializeApp(config);
  secondary = initializeApp(config, 'secondary');
  for (const instance of [app, secondary]) {
    connectAuthEmulator(getAuth(instance), 'http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST, { disableWarnings: true });
  }
  web = await import('../../web/firebase-data.js');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(web.db, host, Number(port));
  env = await initializeTestEnvironment({
    projectId, firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await web.logout();
  const response = await fetch('http://' + process.env.FIREBASE_AUTH_EMULATOR_HOST
    + '/emulator/v1/projects/' + projectId + '/accounts', { method: 'DELETE' });
  assert.equal(response.ok, true);
  await env.clearFirestore();
});
after(async () => {
  await env?.cleanup();
  if (web) { await web.logout(); await terminate(web.db); }
  if (secondary) await deleteApp(secondary);
  if (app) await deleteApp(app);
});

async function account(profile) {
  const credential = await createUserWithEmailAndPassword(web.auth, email, password);
  const uid = credential.user.uid;
  if (profile) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Usar el SDK de la capa web con su referencia de Firestore.
      const { doc: testDoc, setDoc } = await import('firebase/firestore');
      await setDoc(testDoc(ctx.firestore(), 'users', uid), profile);
    });
  }
  await signOut(web.auth);
  return uid;
}

describe('Capa web con Authentication y Firestore', () => {
  it('NO crea emprendedoras sin una sesion administradora', async () => {
    await assert.rejects(web.createEmprendedora({
      email: 'nueva@conectasur.example', password, displayName: 'Nueva', shopName: 'Tienda',
    }), /administradora activa/);
    assert.equal(web.auth.currentUser, null);
  });
  it('rechaza una cuenta desactivada y cierra su sesion', async () => {
    await account({ role: 'emprendedora', active: false, shopId: 'shopA' });
    await assert.rejects(web.login(email, password), /desactivada/);
    assert.equal(web.auth.currentUser, null);
  });
  it('rechaza una cuenta sin perfil y cierra su sesion', async () => {
    await account(null);
    await assert.rejects(web.login(email, password), /permiso/);
    assert.equal(web.auth.currentUser, null);
  });
  it('rechaza un rol desconocido', async () => {
    await account({ role: 'superusuario', active: true });
    await assert.rejects(web.login(email, password), /permiso/);
    assert.equal(web.auth.currentUser, null);
  });
  it('un comprador NO ejecuta las funciones administrativas', async () => {
    await account({ role: 'comprador', active: true });
    await web.login(email, password);
    await assert.rejects(web.saveAssociation('a1', { name: 'Ajena' }), /administradora activa/);
    await assert.rejects(web.setEmprendedoraActive('otra', 'shopA', false), /administradora activa/);
    await assert.rejects(web.createEmprendedora({
      email: 'nueva@conectasur.example', password, displayName: 'Nueva', shopName: 'Tienda',
    }), /administradora activa/);
  });
  it('el admin crea tienda y perfil sin perder su propia sesion', async () => {
    const adminUid = await account({ role: 'admin', active: true });
    await web.login(email, password);
    const result = await web.createEmprendedora({
      email: 'nueva@conectasur.example', password, displayName: 'Nueva', shopName: 'Tienda',
    });
    assert.equal(web.auth.currentUser.uid, adminUid);
    assert.equal(getAuth(secondary).currentUser, null);
    const profile = (await getDoc(doc(web.db, 'users', result.uid))).data();
    assert.equal(profile.role, 'emprendedora');
    assert.equal(profile.shopId, result.shopId);
    assert.equal((await web.getShop(result.shopId)).ownerUid, result.uid);
  });
  it('el admin NO puede usar saveListItem para escribir una coleccion arbitraria', async () => {
    await account({ role: 'admin', active: true });
    await web.login(email, password);
    await assert.rejects(web.saveListItem('users', 'intruso', 'Intruso'), /Lista no permitida/);
  });
  it('logout elimina la sesion usada por la capa de datos', async () => {
    await account({ role: 'comprador', active: true });
    await web.login(email, password);
    assert.ok(web.auth.currentUser);
    await web.logout();
    assert.equal(web.auth.currentUser, null);
  });
});
