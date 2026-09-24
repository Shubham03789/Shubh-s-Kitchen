import fs from "node:fs";
import { loadAdapters, createDatabases } from "../server/databases.js";
import { CATALOG } from "../server/catalog.js";

if (!fs.existsSync(".env")) {
  console.error("\n✗ No .env here. Run this from the project folder, after copying .env.example to .env.\n");
  process.exit(1);
}
process.loadEnvFile(".env");

const HINTS = [
  [/ENOTFOUND|getaddrinfo/i, "The host name in the URL is wrong, or you are offline. Copy the connection string again."],
  [/ECONNREFUSED|ETIMEDOUT|timeout/i, "Nothing answered. Aiven free services power off when idle: open the Aiven console and power the service on. Also check the port in the URL."],
  [/password authentication failed|Access denied|authentication/i, "Wrong user name or password. If the password has symbols like @ # / ?, they must be URL encoded in the URL."],
  [/self[- ]signed|unable to get local issuer|certificate/i, "Certificate problem. Download the CA certificate and put it in the *_CA_CERT variable."],
  [/DECODER|private key|PEM|invalid_grant|Invalid JWT/i, "The Firebase private key is malformed. Run npm run setup:firebase again to copy it in properly."],
  [/NOT_FOUND|database .* does not exist|The database \(default\) does not exist/i, "Firestore is not created yet. Firebase console > Build > Firestore Database > Create database."],
  [/PERMISSION_DENIED|permission/i, "The service account has no access. Generate a new key for THIS project (FIREBASE_PROJECT_ID)."],
  [/database "?\w+"? does not exist|Unknown database/i, "The database name at the end of the URL is wrong (usually defaultdb)."],
];

function hintFor(error) {
  const text = `${error.code || ""} ${error.message || ""}`;
  const hit = HINTS.find(([pattern]) => pattern.test(text));
  return hit ? hit[1] : "Read the error above. If it mentions the URL, copy the connection string again.";
}

console.log(`\nFIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID || "(missing: Google sign in will not work)"}`);
console.log(`PRIMARY_DB:          ${process.env.PRIMARY_DB || "firebase (default)"}\n`);

const entries = createDatabases(await loadAdapters(), { catalog: CATALOG });
let working = 0;

for (const entry of entries) {
  if (!entry.configured) {
    console.log(`–  ${entry.label.padEnd(20)} not set up (missing ${entry.missingEnv.join(", ")})`);
    continue;
  }
  const started = Date.now();
  try {
    const db = await entry.getDb();
    await db.ping();
    const products = await db.listProducts();
    working += 1;
    console.log(`✓  ${entry.label.padEnd(20)} ok: ${products.length} products (${Date.now() - started} ms)`);
  } catch (error) {
    console.log(`✗  ${entry.label.padEnd(20)} ${error.code ? `[${error.code}] ` : ""}${error.message}`);
    console.log(`   → ${hintFor(error)}`);
  }
}

console.log(`\n${working} of ${entries.length} databases working. Restart npm run dev after changing .env.\n`);
process.exit(0);
