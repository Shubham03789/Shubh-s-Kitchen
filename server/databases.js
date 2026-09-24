export const DB_ORDER = ["firebase", "cockroachdb", "mysql"];

export async function loadAdapters() {
  const modules = await Promise.all([
    import("../src/database/firebase.js"),
    import("../src/database/cockroachdb.js"),
    import("../src/database/mysql.js"),
  ]);
  return modules;
}

export function createDatabases(adapters, { catalog, env = process.env }) {
  return adapters.map((adapter) => {
    const missingEnv = adapter.requiredEnv.filter((name) => !env[name]);
    let dbPromise = null;

    return {
      id: adapter.id,
      label: adapter.label,
      requiredEnv: adapter.requiredEnv,
      configured: missingEnv.length === 0,
      missingEnv,

      getDb() {
        if (!dbPromise) {
          dbPromise = (async () => {
            const db = adapter.createDb();
            await db.init(catalog);
            return db;
          })().catch((error) => {
            dbPromise = null;
            throw error;
          });
        }
        return dbPromise;
      },
    };
  });
}

function safeError(entry) {
  return `Could not reach ${entry.label}. Check ${entry.requiredEnv.join(" and ")} and the function logs.`;
}

export async function runOn(entry, fn) {
  const base = { id: entry.id, label: entry.label };
  if (!entry.configured) {
    return { ...base, state: "not_configured", missingEnv: entry.missingEnv };
  }
  try {
    const db = await entry.getDb();
    const data = await fn(db);
    return data === undefined ? { ...base, state: "ok" } : { ...base, state: "ok", data };
  } catch (error) {
    console.error(`[${entry.id}]`, error);
    return { ...base, state: "error", error: safeError(entry) };
  }
}

export async function fanOut(entries, fn) {
  const settled = await Promise.allSettled(entries.map((entry) => runOn(entry, fn)));
  return settled.map((outcome, index) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : { id: entries[index].id, label: entries[index].label, state: "error", error: safeError(entries[index]) }
  );
}

export function readOrder(entries, fromId) {
  const rank = (entry) => (entry.id === fromId ? -1 : DB_ORDER.indexOf(entry.id));
  return [...entries].sort((a, b) => rank(a) - rank(b));
}

export async function readWithFallback(entries, fromId, fn) {
  for (const entry of readOrder(entries, fromId)) {
    if (!entry.configured) continue;
    const result = await runOn(entry, fn);
    if (result.state === "ok") return { source: entry.id, data: result.data };
    console.warn(`Reading from ${entry.label} failed, trying the next database.`);
  }
  return null;
}
