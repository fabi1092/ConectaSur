// Capa de datos WEB de ConectaSur (para Kisho). Es JavaScript moderno (modulos ES): sirve con
// React, Vue o JS simple. Instalar:  npm install firebase
// Regla de oro: las pantallas llaman SOLO a estas funciones; nunca a Firestore directo (RNF-DAT-02).
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, collection, getDocs, onSnapshot, query, where,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove,
} from "firebase/firestore";

// 1) Pega aqui la config web del proyecto Firebase (Configuracion del proyecto > Tus apps > Web).
//    Esta config NO es secreta (la seguridad la dan las reglas), pero no pongas claves privadas.
export const firebaseConfig = {
  apiKey: "PEGA_AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.firebasestorage.app",
  messagingSenderId: "PEGA_AQUI",
  appId: "PEGA_AQUI",
};

const app = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Persistencia local: la web tambien lee datos ya descargados si se corta la red.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// ---------- Acceso ----------
export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await getDoc(doc(db, "users", cred.user.uid));
  if (!profile.exists() || profile.data().active !== true) {
    await signOut(auth);
    throw new Error("Tu cuenta no tiene permiso para entrar o fue desactivada");
  }
  return { uid: cred.user.uid, ...profile.data() }; // { role, shopId, active, displayName }
}
export const logout = () => signOut(auth);
export const onSession = (callback) => onAuthStateChanged(auth, callback);

// ---------- Administrador: emprendedoras ----------
// Truco: se crea la cuenta con una SEGUNDA instancia de Firebase para que el administrador
// no pierda su propia sesion (createUserWithEmailAndPassword inicia sesion con la cuenta nueva).
export async function createEmprendedora({ email, password, displayName, shopName }) {
  const secondary = getApps().find((a) => a.name === "secondary") ?? initializeApp(firebaseConfig, "secondary");
  const secondaryAuth = getAuth(secondary);
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
  const uid = cred.user.uid;
  await signOut(secondaryAuth);

  const shopId = `shop_${uid}`;
  const batch = writeBatch(db); // escribe con la sesion del administrador
  batch.set(doc(db, "users", uid), { role: "emprendedora", active: true, shopId, displayName });
  batch.set(doc(db, "shops", shopId), {
    ownerUid: uid, name: shopName, description: "", logoUrl: null, entrepreneurType: "",
    sector: "", contact: "", showPrices: true, active: true, associationIds: [],
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return { uid, shopId };
}

// Desactivar = no borrar: la cuenta deja de poder entrar y editar (las reglas miran users/{uid}.active).
export async function setEmprendedoraActive(uid, shopId, active) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), { active });
  batch.update(doc(db, "shops", shopId), { active });
  await batch.commit();
}

export async function listShops() {
  const snap = await getDocs(collection(db, "shops"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- Administrador: asociaciones ----------
export async function saveAssociation(id, data) {
  await setDoc(doc(db, "associations", id), { active: true, ...data }, { merge: true });
}
export async function setAssociationActive(id, active) {
  await updateDoc(doc(db, "associations", id), { active });
}
export async function listAssociations() {
  const snap = await getDocs(collection(db, "associations"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export const addShopToAssociation = (shopId, associationId) =>
  updateDoc(doc(db, "shops", shopId), { associationIds: arrayUnion(associationId) });
export const removeShopFromAssociation = (shopId, associationId) =>
  updateDoc(doc(db, "shops", shopId), { associationIds: arrayRemove(associationId) });

// ---------- Administrador: tipos y categorias ----------
// collectionName: "categories" | "productTypes" | "entrepreneurTypes"
export const saveListItem = (collectionName, id, name) =>
  setDoc(doc(db, collectionName, id), { name }, { merge: true });
export async function listItems(collectionName) {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- Tienda y catalogo publico ----------
export async function getShop(shopId) {
  const snap = await getDoc(doc(db, "shops", shopId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
// Campos que la emprendedora puede editar (los mismos que permiten las reglas).
export const updateShop = (shopId, changes) =>
  updateDoc(doc(db, "shops", shopId), { ...changes, updatedAt: serverTimestamp() });

export function watchPublicProducts(callback, shopId = null) {
  const base = collection(db, "publicProducts");
  const q = shopId ? query(base, where("shopId", "==", shopId)) : base;
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
