import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to delete data without --confirm");
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const collections = [
  "subscription_requests",
  "subscriptions",
  "notifications",
  "audit_logs",
  "credentials",
];

const removed = {};
for (const collectionName of collections) {
  const snapshot = await db.collection(collectionName).get();
  const writer = db.bulkWriter();
  for (const document of snapshot.docs) writer.delete(document.ref);
  await writer.close();
  removed[collectionName] = snapshot.size;
}

console.log(JSON.stringify({ ok: true, removed }, null, 2));
