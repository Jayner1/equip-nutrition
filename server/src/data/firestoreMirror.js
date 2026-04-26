const admin = require("firebase-admin");

let db;

function parsePrivateKey(rawKey) {
  if (!rawKey) {
    return "";
  }
  return rawKey.replace(/\\n/g, "\n");
}

function getServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

async function getDb() {
  if (db) {
    return db;
  }

  const serviceAccount = getServiceAccountFromEnv();
  if (!serviceAccount) {
    return null;
  }

  const app =
    admin.apps.length > 0
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.projectId,
        });

  db = app.firestore();
  return db;
}

function isFirebaseConfigured() {
  return Boolean(getServiceAccountFromEnv());
}

async function listClientsFromFirestore() {
  const database = await getDb();
  if (!database) {
    return null;
  }

  const snapshot = await database.collection("clients").orderBy("createdAt", "desc").get();
  return snapshot.docs.map((item) => ({ _id: item.id, ...item.data() }));
}

async function getClientFromFirestore(id) {
  const database = await getDb();
  if (!database) {
    return null;
  }

  const snapshot = await database.collection("clients").doc(id).get();
  if (!snapshot.exists) {
    return undefined;
  }
  return { _id: snapshot.id, ...snapshot.data() };
}

async function upsertClientToFirestore(client) {
  const database = await getDb();
  if (!database) {
    return false;
  }

  await database.collection("clients").doc(client._id).set({ ...client, _id: client._id });
  return true;
}

async function deleteClientFromFirestore(id) {
  const database = await getDb();
  if (!database) {
    return false;
  }

  await database.collection("clients").doc(id).delete();
  return true;
}

module.exports = {
  isFirebaseConfigured,
  listClientsFromFirestore,
  getClientFromFirestore,
  upsertClientToFirestore,
  deleteClientFromFirestore,
};
