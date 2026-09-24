import { createApi, corsHeaders } from "./handlers.js";
import { createFirebaseVerifier } from "./auth.js";
import { CATALOG } from "./catalog.js";
import { createDatabases, loadAdapters, DB_ORDER } from "./databases.js";

export class SetupError extends Error {}

const REQUIRED_ENV = ["FIREBASE_PROJECT_ID"];

const HOW_TO_FIX =
  "Add them to .env for local development, or to your Vercel or Netlify environment variables and redeploy.";

export function checkEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new SetupError(`Missing environment variables: ${missing.join(", ")}. ${HOW_TO_FIX}`);
  }

  const primaryId = (env.PRIMARY_DB || "").trim() || "firebase";
  if (!DB_ORDER.includes(primaryId)) {
    throw new SetupError(
      `PRIMARY_DB must be one of: ${DB_ORDER.join(", ")}. Fix it in .env or your Vercel or Netlify environment variables.`
    );
  }
  return { primaryId };
}

export async function build() {
  const { primaryId } = checkEnv();
  const adapters = await loadAdapters();
  const databases = createDatabases(adapters, { catalog: CATALOG });

  for (const entry of databases) {
    if (!entry.configured) {
      console.warn(`${entry.label} is not configured (missing ${entry.missingEnv.join(", ")}), so it is skipped.`);
    }
  }

  return createApi({ databases, verifyIdToken: createFirebaseVerifier(), primaryId });
}

let apiPromise = null;

export function getApi() {
  if (!apiPromise) {
    apiPromise = build().catch((error) => {
      apiPromise = null;
      throw error;
    });
  }
  return apiPromise;
}

export function setApiForTesting(api) {
  apiPromise = api ? Promise.resolve(api) : null;
}

export async function handle(request) {
  try {
    const api = await getApi();
    return await api(request);
  } catch (error) {
    const message =
      error instanceof SetupError
        ? error.message
        : "The server could not start. Check the function logs.";
    if (error instanceof SetupError) console.error(error.message);
    else console.error(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...corsHeaders(request),
      },
    });
  }
}
