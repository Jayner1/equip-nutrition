let firebaseModulesPromise;

async function getFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([import("firebase/app"), import("firebase/firestore")]);
  }
  const [appModule, firestoreModule] = await firebaseModulesPromise;
  return {
    initializeApp: appModule.initializeApp,
    getApps: appModule.getApps,
    getFirestore: firestoreModule.getFirestore,
    collection: firestoreModule.collection,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    getDocs: firestoreModule.getDocs,
    query: firestoreModule.query,
    orderBy: firestoreModule.orderBy,
    setDoc: firestoreModule.setDoc,
    deleteDoc: firestoreModule.deleteDoc,
  };
}

let db;

async function getDb() {
  if (db) {
    return db;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const apiKey = process.env.FIREBASE_API_KEY;
  const appId = process.env.FIREBASE_APP_ID;

  if (!projectId || !apiKey || !appId) {
    return null;
  }

  const { initializeApp, getApps, getFirestore } = await getFirebaseModules();
  const config = {
    apiKey,
    appId,
    projectId,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  };

  const app = getApps().length ? getApps()[0] : initializeApp(config);
  db = getFirestore(app);
  return db;
}

function isFirebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_API_KEY && process.env.FIREBASE_APP_ID
  );
}

async function listClientsFromFirestore() {
  const database = await getDb();
  if (!database) {
    return null;
  }

  const { collection, getDocs, query, orderBy } = await getFirebaseModules();
  const clientsQuery = query(collection(database, "clients"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(clientsQuery);
  return snapshot.docs.map((item) => ({ _id: item.id, ...item.data() }));
}

async function getClientFromFirestore(id) {
  const database = await getDb();
  if (!database) {
    return null;
  }

  const { doc, getDoc } = await getFirebaseModules();
  const ref = doc(database, "clients", id);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return undefined;
  }
  return { _id: snapshot.id, ...snapshot.data() };
}

async function upsertClientToFirestore(client) {
  const database = await getDb();
  if (!database) {
    return false;
  }

  const { doc, setDoc } = await getFirebaseModules();
  await setDoc(doc(database, "clients", client._id), { ...client, _id: client._id });
  return true;
}

async function deleteClientFromFirestore(id) {
  const database = await getDb();
  if (!database) {
    return false;
  }

  const { doc, deleteDoc } = await getFirebaseModules();
  await deleteDoc(doc(database, "clients", id));
  return true;
}

module.exports = {
  isFirebaseConfigured,
  listClientsFromFirestore,
  getClientFromFirestore,
  upsertClientToFirestore,
  deleteClientFromFirestore,
};
