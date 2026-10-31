// Carga DATOS FICTICIOS en tu proyecto Firebase de DESARROLLO (nunca en el real).
//
// Antes de correrlo:
//   1) Copia seed/firebase-config.example.json a seed/firebase-config.json y pega tu config web.
//   2) Crea a mano el usuario admin (ver GUIA.md, paso 6).
//   3) Define ADMIN_EMAIL y ADMIN_PASSWORD (el admin del paso 2).
// Uso:  npm run seed
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const config = JSON.parse(readFileSync(new URL('./firebase-config.json', import.meta.url), 'utf8'));
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo-ConectaSur-2026';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Falta ADMIN_EMAIL o ADMIN_PASSWORD (ver GUIA.md, paso 8).');
  process.exit(1);
}

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

const emprendedoras = [
  { email: 'ana@demo.conectasur.cl', name: 'Ana Demo', shopId: 'shop_demo_ana', shop: 'Tejidos de Alerce', sector: 'Alerce', type: 'Artesanías' },
  { email: 'bea@demo.conectasur.cl', name: 'Bea Demo', shopId: 'shop_demo_bea', shop: 'Dulces del Sur', sector: 'Puerto Montt Centro', type: 'Alimentos' },
];

// Productos de ejemplo (los nombres de foto son los recursos que ya trae la app).
const productos = [
  { id: 'flores', shopId: 'shop_demo_ana', name: 'Flores tejidas', description: 'Flores decorativas tejidas a mano. Consulta los colores disponibles. Son artesanías, no plantas vivas.', category: 'Artesanías', priceClp: 8000, showPrice: true, stockMode: 'UNITS', quantity: 3, visible: true, photo: 'flores', variants: [] },
  { id: 'bandejas', shopId: 'shop_demo_ana', name: 'Bandejas decoradas', description: 'Bandejas decorativas para el hogar. Consulta tamaños, materiales y diseños antes de encargar.', category: 'Artesanías', priceClp: 12000, showPrice: true, stockMode: 'UNITS', quantity: 2, visible: true, photo: 'bandejas', variants: [] },
  { id: 'pedido', shopId: 'shop_demo_ana', name: 'Artesanía por encargo', description: 'Una creación hecha a tu gusto. Consulta el diseño y el plazo con la emprendedora.', category: 'Artesanías', priceClp: 18000, showPrice: false, stockMode: 'ON_REQUEST', quantity: null, visible: true, photo: 'bandejas', variants: [] },
  { id: 'gorro', shopId: 'shop_demo_ana', name: 'Gorro de lana (talla S/M/L)', description: 'Gorro tejido en lana. Elige tu talla.', category: 'Ropa', priceClp: 9500, showPrice: true, stockMode: 'UNITS', quantity: 6, visible: true, photo: 'flores',
    variants: [{ id: 'S', label: 'Talla S', quantity: 1 }, { id: 'M', label: 'Talla M', quantity: 2 }, { id: 'L', label: 'Talla L', quantity: 3 }] },
  { id: 'cuadro', shopId: 'shop_demo_bea', name: 'Cuadro bordado (pieza única)', description: 'Pieza única bordada a mano.', category: 'Artesanías', priceClp: 25000, showPrice: true, stockMode: 'UNIQUE', quantity: 1, visible: true, photo: 'bandejas', variants: [] },
];

// Misma regla que toPublicOrNull() de la app.
function toPublic(p) {
  if (!p.visible || (p.stockMode !== 'ON_REQUEST' && (p.quantity ?? 0) <= 0)) return null;
  return {
    id: p.id, shopId: p.shopId, name: p.name, description: p.description, category: p.category,
    priceClp: p.showPrice ? p.priceClp : null, onRequest: p.stockMode === 'ON_REQUEST',
    photo: p.photo, updatedAt: serverTimestamp(),
  };
}

// 1) Crear las cuentas de Authentication (si ya existen, solo se obtiene su uid).
const uids = {};
for (const e of emprendedoras) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, e.email, DEMO_PASSWORD);
    uids[e.email] = cred.user.uid;
  } catch (err) {
    if (err.code !== 'auth/email-already-in-use') throw err;
    const cred = await signInWithEmailAndPassword(auth, e.email, DEMO_PASSWORD);
    uids[e.email] = cred.user.uid;
  }
  await signOut(auth);
}

// 2) Entrar como administrador y escribir todo lo demás.
await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);

for (const e of emprendedoras) {
  const uid = uids[e.email];
  await setDoc(doc(db, 'users', uid), { role: 'emprendedora', active: true, shopId: e.shopId, displayName: e.name });
  await setDoc(doc(db, 'shops', e.shopId), {
    ownerUid: uid, name: e.shop, description: 'Tienda de ejemplo (datos ficticios).', logoUrl: null,
    entrepreneurType: e.type, sector: e.sector, contact: 'contacto@ejemplo.cl', showPrices: true,
    active: true, associationIds: ['asoc_demo'], createdAt: serverTimestamp(),
  });
}

await setDoc(doc(db, 'associations', 'asoc_demo'), { name: 'Asociación Emprendedoras de Alerce (demo)', sector: 'Alerce', description: 'Asociación ficticia.', active: true });
for (const t of ['Artesanías', 'Alimentos', 'Ropa']) await setDoc(doc(db, 'categories', t), { name: t });
for (const t of ['Artesanías', 'Alimentos', 'Servicios']) await setDoc(doc(db, 'entrepreneurTypes', t), { name: t });
for (const t of ['Regular', 'A pedido', 'Pieza única']) await setDoc(doc(db, 'productTypes', t), { name: t });

// Los productos privados los escribe su dueña; aquí iniciamos sesión como cada una.
await signOut(auth);
for (const e of emprendedoras) {
  await signInWithEmailAndPassword(auth, e.email, DEMO_PASSWORD);
  for (const p of productos.filter((x) => x.shopId === e.shopId)) {
    await setDoc(doc(db, 'shops', e.shopId, 'products', p.id), { ...p, updatedAt: serverTimestamp() });
    const pub = toPublic(p);
    if (pub) await setDoc(doc(db, 'publicProducts', p.id), pub);
  }
  await signOut(auth);
}

console.log('Listo. Cuentas de prueba (clave: ' + DEMO_PASSWORD + '):');
for (const e of emprendedoras) console.log(' -', e.email);
process.exit(0);
