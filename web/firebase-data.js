// Capa de datos WEB de ConectaSur (para Kisho). Es JavaScript moderno (modulos ES): sirve con
// React, Vue o JS simple. Instalar:  npm install firebase
// Regla de oro: las pantallas llaman SOLO a estas funciones; nunca a Firestore directo (RNF-DAT-02).
import { initializeApp, getApps } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  onAuthStateChanged, setPersistence, browserSessionPersistence, inMemoryPersistence,
} from "firebase/auth";
import {
  initializeFirestore, memoryLocalCache,
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
// En un computador compartido no dejamos documentos en IndexedDB.
// La memoria mantiene los documentos consultados mientras esta pagina siga abierta.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

const sessionReady = setPersistence(auth,
  typeof window === "undefined" ? inMemoryPersistence : browserSessionPersistence);

async function requireAdmin() {
  await sessionReady;
  const user = auth.currentUser;
  const profile = user && await getDoc(doc(db, "users", user.uid));
  if (!profile?.exists() || profile.data().active !== true || profile.data().role !== "admin") {
    throw new Error("Esta accion requiere una cuenta administradora activa");
  }
  // Esto evita acciones innecesarias en la UI. Las reglas siguen siendo la autoridad.
}

// ---------- Acceso ----------
export async function login(email, password) {
  await sessionReady;
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  try {
    const profile = await getDoc(doc(db, "users", cred.user.uid));
    if (!profile.exists() || profile.data().active !== true
        || !["admin", "emprendedora", "comprador"].includes(profile.data().role)) {
      throw new Error("Tu cuenta no tiene permiso para entrar o fue desactivada");
    }
    return { ...profile.data(), uid: cred.user.uid };
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}
export const logout = () => signOut(auth);
export const onSession = (callback) => onAuthStateChanged(auth, callback);

// ---------- Administrador: emprendedoras ----------
// Truco: se crea la cuenta con una SEGUNDA instancia de Firebase para que el administrador
// no pierda su propia sesion (createUserWithEmailAndPassword inicia sesion con la cuenta nueva).
export async function createEmprendedora({ email, password, displayName, shopName }) {
  await requireAdmin(); // Antes de crear una cuenta en Authentication.
  const secondary = getApps().find((a) => a.name === "secondary") ?? initializeApp(firebaseConfig, "secondary");
  const secondaryAuth = getAuth(secondary);
  await setPersistence(secondaryAuth, inMemoryPersistence);
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
    uid = cred.user.uid;
  } finally {
    await signOut(secondaryAuth);
  }

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
  await requireAdmin();
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
  await requireAdmin();
  await setDoc(doc(db, "associations", id), { active: true, ...data }, { merge: true });
}
export async function setAssociationActive(id, active) {
  await requireAdmin();
  await updateDoc(doc(db, "associations", id), { active });
}
export async function listAssociations() {
  const snap = await getDocs(collection(db, "associations"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addShopToAssociation(shopId, associationId) {
  await requireAdmin();
  return updateDoc(doc(db, "shops", shopId), { associationIds: arrayUnion(associationId) });
}
export async function removeShopFromAssociation(shopId, associationId) {
  await requireAdmin();
  return updateDoc(doc(db, "shops", shopId), { associationIds: arrayRemove(associationId) });
}

// ---------- Administrador: tipos y categorias ----------
// collectionName: "categories" | "productTypes" | "entrepreneurTypes"
export async function saveListItem(collectionName, id, name) {
  await requireAdmin();
  if (!["categories", "productTypes", "entrepreneurTypes"].includes(collectionName)) {
    throw new Error("Lista no permitida");
  }
  return setDoc(doc(db, collectionName, id), { name }, { merge: true });
}
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
