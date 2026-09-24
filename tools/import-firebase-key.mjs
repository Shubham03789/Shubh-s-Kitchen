import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV_FILE = path.resolve(".env");
const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const given = args.find((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function readEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values.set(match[1], match[2].trim());
  }
  return values;
}

function isServiceAccount(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.type === "service_account" && data.private_key && data.client_email;
  } catch {
    return false;
  }
}

function findKeyFile(projectId) {
  const downloads = path.join(os.homedir(), "Downloads");
  if (!fs.existsSync(downloads)) return null;
  const candidates = fs
    .readdirSync(downloads)
    .filter((name) => name.endsWith(".json") && (!projectId || name.startsWith(projectId)))
    .map((name) => path.join(downloads, name))
    .filter(isServiceAccount)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}

if (!fs.existsSync(ENV_FILE)) fail("No .env here. Run this from the project folder, after copying .env.example to .env.");

let envText = fs.readFileSync(ENV_FILE, "utf8");
const projectId = readEnv(envText).get("FIREBASE_PROJECT_ID");

const keyFile = given ? path.resolve(given) : findKeyFile(projectId);
if (!keyFile) {
  fail(
    `No service account file for "${projectId || "your project"}" found in Downloads.\n` +
      "  Firebase console > Project settings > Service accounts > Generate new private key,\n" +
      "  then run this again (or pass the file path: npm run setup:firebase -- C:\\path\\to\\key.json)."
  );
}
if (!isServiceAccount(keyFile)) fail(`${keyFile} is not a Firebase service account file.`);

const key = JSON.parse(fs.readFileSync(keyFile, "utf8"));
if (projectId && key.project_id !== projectId) {
  fail(`That key is for project "${key.project_id}", but FIREBASE_PROJECT_ID in .env is "${projectId}".`);
}

const lines = {
  FIREBASE_CLIENT_EMAIL: key.client_email,
  FIREBASE_PRIVATE_KEY: JSON.stringify(key.private_key),
};

for (const [name, value] of Object.entries(lines)) {
  const pattern = new RegExp(`^${name}=.*$`, "m");
  envText = pattern.test(envText)
    ? envText.replace(pattern, () => `${name}=${value}`)
    : `${envText.trimEnd()}\n${name}=${value}\n`;
}
fs.writeFileSync(ENV_FILE, envText);

console.log(`\n✓ Saved FIREBASE_CLIENT_EMAIL (${key.client_email}) and FIREBASE_PRIVATE_KEY to .env`);
console.log(`  from ${keyFile}`);

if (shouldDelete) {
  fs.unlinkSync(keyFile);
  console.log("✓ Deleted the downloaded key file.");
} else {
  console.log("  Now delete that .json file (or run again with --delete). Never commit it.");
}
console.log("  Next: npm run check, then restart npm run dev.\n");
