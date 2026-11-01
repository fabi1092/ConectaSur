// Pruebas automaticas de las reglas de seguridad (Firebase Emulator Suite).
// Se ejecutan con:  npm test
import { readFileSync } from 'node:fs';
import { before, after, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-conectasur',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});
after(async () => { await env.cleanup(); });

// Datos de partida (se escriben saltandose las reglas).
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/admin1'), { role: 'admin', active: true, displayName: 'Admin' });
    await setDoc(doc(db, 'users/ana'), { role: 'emprendedora', active: true, shopId: 'shopA', displayName: 'Ana' });
    await setDoc(doc(db, 'users/bea'), { role: 'emprendedora', active: true, shopId: 'shopB', displayName: 'Bea' });
    await setDoc(doc(db, 'users/ines'), { role: 'emprendedora', active: false, shopId: 'shopC', displayName: 'Ines' });
    await setDoc(doc(db, 'users/cami'), { role: 'comprador', active: true, displayName: 'Cami' });
    await setDoc(doc(db, 'shops/shopA'), { ownerUid: 'ana', name: 'Tienda A', showPrices: true, active: true });
    await setDoc(doc(db, 'shops/shopB'), { ownerUid: 'bea', name: 'Tienda B', showPrices: true, active: true });
    await setDoc(doc(db, 'shops/shopC'), { ownerUid: 'ines', name: 'Tienda C', showPrices: true, active: true });
    await setDoc(doc(db, 'shops/shopA/products/p1'), { name: 'Flores', quantity: 3 });
    await setDoc(doc(db, 'shops/shopA/sales/s1'), { productId: 'p1', quantity: 1, priceClp: 8000 });
    await setDoc(doc(db, 'publicProducts/p1'), { id: 'p1', shopId: 'shopA', name: 'Flores', onRequest: false, priceClp: 8000 });
  });
});

const as = (uid) => env.authenticatedContext(uid);
const visitor = () => env.unauthenticatedContext();
const publicDoc = (shopId, extra = {}) => ({ id: 'p2', shopId, name: 'Bandejas', onRequest: false, priceClp: 12000, ...extra });

describe('Visitante (sin sesion)', () => {
  it('puede leer el catalogo publico y las tiendas', async () => {
    await assertSucceeds(getDoc(doc(visitor().firestore(), 'publicProducts/p1')));
    await assertSucceeds(getDoc(doc(visitor().firestore(), 'shops/shopA')));
  });
  it('NO puede leer productos privados ni ventas', async () => {
    await assertFails(getDoc(doc(visitor().firestore(), 'shops/shopA/products/p1')));
    await assertFails(getDoc(doc(visitor().firestore(), 'shops/shopA/sales/s1')));
  });
  it('NO puede leer perfiles de usuario ni escribir nada', async () => {
    await assertFails(getDoc(doc(visitor().firestore(), 'users/ana')));
    await assertFails(setDoc(doc(visitor().firestore(), 'publicProducts/x'), publicDoc('shopA')));
  });
});

describe('Emprendedora', () => {
  it('puede editar SU tienda', async () => {
    await assertSucceeds(updateDoc(doc(as('ana').firestore(), 'shops/shopA'), { description: 'Tejidos de Alerce' }));
  });
  it('NO puede editar la tienda de otra emprendedora', async () => {
    await assertFails(updateDoc(doc(as('ana').firestore(), 'shops/shopB'), { description: 'hackeada' }));
  });
  it('NO puede cambiar el dueño ni desactivar su propia tienda', async () => {
    await assertFails(updateDoc(doc(as('ana').firestore(), 'shops/shopA'), { ownerUid: 'bea' }));
    await assertFails(updateDoc(doc(as('ana').firestore(), 'shops/shopA'), { active: false }));
  });
  it('NO puede dejar el nombre vacio ni escribir tipos invalidos en su tienda', async () => {
    await assertFails(updateDoc(doc(as('ana').firestore(), 'shops/shopA'), { name: '' }));
    await assertFails(updateDoc(doc(as('ana').firestore(), 'shops/shopA'), { showPrices: 'si' }));
  });
  it('puede publicar un producto publico valido en su tienda', async () => {
    await assertSucceeds(setDoc(doc(as('ana').firestore(), 'publicProducts/p2'), publicDoc('shopA')));
  });
  it('NO puede publicar con stock (campo privado) ni en la tienda de otra', async () => {
    await assertFails(setDoc(doc(as('ana').firestore(), 'publicProducts/p2'), publicDoc('shopA', { quantity: 5 })));
    await assertFails(setDoc(doc(as('ana').firestore(), 'publicProducts/p2'), publicDoc('shopB')));
  });
  it('NO puede publicar con precio negativo ni id incoherente', async () => {
    await assertFails(setDoc(doc(as('ana').firestore(), 'publicProducts/p2'), publicDoc('shopA', { priceClp: -1000 })));
    await assertFails(setDoc(doc(as('ana').firestore(), 'publicProducts/p2'), publicDoc('shopA', { id: 'otro' })));
  });
  it('NO puede borrar ni cambiar productos publicos ajenos', async () => {
    await assertFails(deleteDoc(doc(as('bea').firestore(), 'publicProducts/p1')));
    await assertFails(updateDoc(doc(as('bea').firestore(), 'publicProducts/p1'), { name: 'robado' }));
  });
  it('lee y escribe SU catalogo privado y SUS ventas', async () => {
    await assertSucceeds(getDoc(doc(as('ana').firestore(), 'shops/shopA/products/p1')));
    await assertSucceeds(getDoc(doc(as('ana').firestore(), 'shops/shopA/sales/s1')));
    await assertSucceeds(setDoc(doc(as('ana').firestore(), 'shops/shopA/sales/s2'), { productId: 'p1', quantity: 1 }));
  });
  it('NO lee las ventas ni el catalogo privado de otra', async () => {
    await assertFails(getDoc(doc(as('bea').firestore(), 'shops/shopA/sales/s1')));
    await assertFails(getDoc(doc(as('bea').firestore(), 'shops/shopA/products/p1')));
  });
  it('desactivada: ya no puede editar su tienda', async () => {
    await assertFails(updateDoc(doc(as('ines').firestore(), 'shops/shopC'), { description: 'sigo aqui' }));
  });
  it('NO puede crear asociaciones ni otras tiendas', async () => {
    await assertFails(setDoc(doc(as('ana').firestore(), 'associations/a1'), { name: 'Asociacion falsa' }));
    await assertFails(setDoc(doc(as('ana').firestore(), 'shops/shopZ'), { name: 'Otra', ownerUid: 'ana' }));
  });
});

describe('Administrador', () => {
  it('puede crear asociaciones, tiendas y cuentas', async () => {
    const db = as('admin1').firestore();
    await assertSucceeds(setDoc(doc(db, 'associations/a1'), { name: 'Asociacion Alerce' }));
    await assertSucceeds(setDoc(doc(db, 'shops/shopZ'), { name: 'Nueva', ownerUid: 'zzz' }));
    await assertSucceeds(setDoc(doc(db, 'users/zzz'), { role: 'emprendedora', active: true, shopId: 'shopZ' }));
  });
  it('puede desactivar una emprendedora', async () => {
    await assertSucceeds(updateDoc(doc(as('admin1').firestore(), 'users/ana'), { active: false }));
  });
  it('NO puede leer el historial de ventas de una emprendedora (RN-10)', async () => {
    await assertFails(getDoc(doc(as('admin1').firestore(), 'shops/shopA/sales/s1')));
    await assertFails(getDocs(collection(as('admin1').firestore(), 'shops/shopA/sales')));
  });
});

describe('Comprador', () => {
  it('puede leer el catalogo publico', async () => {
    await assertSucceeds(getDoc(doc(as('cami').firestore(), 'publicProducts/p1')));
  });
  it('NO puede crear asociaciones ni editar tiendas', async () => {
    await assertFails(setDoc(doc(as('cami').firestore(), 'associations/a1'), { name: 'x' }));
    await assertFails(updateDoc(doc(as('cami').firestore(), 'shops/shopA'), { name: 'x' }));
  });
  it('puede crear su perfil como comprador, pero NO como admin', async () => {
    await assertSucceeds(setDoc(doc(as('nuevo1').firestore(), 'users/nuevo1'), { role: 'comprador', active: true, displayName: 'Nuevo' }));
    await assertFails(setDoc(doc(as('nuevo2').firestore(), 'users/nuevo2'), { role: 'admin', active: true, displayName: 'Intruso' }));
  });
  it('NO puede crear perfil con nombre vacio ni escalar a admin despues', async () => {
    await assertFails(setDoc(doc(as('nuevo3').firestore(), 'users/nuevo3'), { role: 'comprador', active: true, displayName: '' }));
    await assertFails(updateDoc(doc(as('cami').firestore(), 'users/cami'), { role: 'admin' }));
  });
});

describe('Storage (fotos y logos)', () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  it('la emprendedora sube una imagen a SU carpeta', async () => {
    const r = ref(as('ana').storage(), 'shops/shopA/logo.png');
    await assertSucceeds(uploadBytes(r, png, { contentType: 'image/png' }));
  });
  it('NO puede subir a la carpeta de otra tienda', async () => {
    const r = ref(as('ana').storage(), 'shops/shopB/logo.png');
    await assertFails(uploadBytes(r, png, { contentType: 'image/png' }));
  });
  it('NO puede subir archivos que no son imagenes', async () => {
    const r = ref(as('ana').storage(), 'shops/shopA/virus.txt');
    await assertFails(uploadBytes(r, png, { contentType: 'text/plain' }));
  });
  it('NO puede subir imagenes de 2 MB o mas', async () => {
    const oversized = new Uint8Array(2 * 1024 * 1024);
    const r = ref(as('ana').storage(), 'shops/shopA/pesada.png');
    await assertFails(uploadBytes(r, oversized, { contentType: 'image/png' }));
  });
  it('un visitante NO puede subir', async () => {
    const r = ref(visitor().storage(), 'shops/shopA/logo.png');
    await assertFails(uploadBytes(r, png, { contentType: 'image/png' }));
  });
});
