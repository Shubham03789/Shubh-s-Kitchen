import crypto from "node:crypto";
import { CATALOG, CURRENCY, findProduct, toPublicProduct } from "./catalog.js";
import { fanOut, readWithFallback } from "./databases.js";
import { validateOrderInput } from "./validate.js";

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function readAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter((value) => value !== "");
}

export function corsHeaders(request) {
  const allowed = readAllowedOrigins();
  const headers = {};

  if (allowed.length === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else {
    const origin = (request.headers.get("origin") || "").replace(/\/+$/, "");
    if (origin !== "" && allowed.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
    headers["Vary"] = "Origin";
  }

  if (request.method === "OPTIONS") {
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

function normalisePath(pathname) {
  let path = pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, "/api");
  path = path.replace(/\/+$/, "");
  return path || "/";
}

function withoutData(result) {
  const { data: _data, ...rest } = result;
  return rest;
}

function nothingSavedMessage(what, results) {
  if (results.length === 1 && results[0].state === "not_configured") {
    return `Could not save ${what}: ${results[0].label} is not set up yet. Add its settings to .env (or your host's environment variables) and restart, or save to all databases instead.`;
  }
  if (results.every((result) => result.state === "not_configured")) {
    return `Could not save ${what} to any database: none is set up yet. Add a database's settings to .env (or your host's environment variables) and restart.`;
  }
  return `Could not save ${what} to any database. Check the function logs, then try again.`;
}

export function createApi({ databases, verifyIdToken, primaryId = "firebase" }) {
  const knownIds = databases.map((entry) => entry.id);

  async function requireUser(request) {
    const header = request.headers.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new HttpError(401, "Sign in to continue.");
    try {
      return await verifyIdToken(match[1].trim());
    } catch (error) {
      console.warn("Token check failed:", error.code || error.message);
      throw new HttpError(401, "Your session has expired. Sign in again.");
    }
  }

  async function readJson(request) {
    try {
      return await request.json();
    } catch {
      throw new HttpError(400, "Request body must be JSON.");
    }
  }

  function readSource(url) {
    const from = (url.searchParams.get("from") || "").trim();
    if (from === "") return primaryId;
    if (!knownIds.includes(from)) {
      throw new HttpError(400, `Unknown database "${from}". Use one of: ${knownIds.join(", ")}.`);
    }
    return from;
  }

  function readTargets(url) {
    const to = (url.searchParams.get("to") || "").trim();
    if (to === "") return databases;
    if (!knownIds.includes(to)) {
      throw new HttpError(400, `Unknown database "${to}". Use one of: ${knownIds.join(", ")}.`);
    }
    return databases.filter((entry) => entry.id === to);
  }

  const routes = {
    "GET /api/health": async () => {
      const results = await fanOut(databases, (db) => db.ping());
      return json({ status: "ok", primary: primaryId, databases: results.map(withoutData) });
    },

    "GET /api/products": async (request, url) => {
      const from = readSource(url);
      const read = await readWithFallback(databases, from, (db) => db.listProducts());
      if (read) return json({ source: read.source, products: read.data });
      return json({ source: "catalog", products: CATALOG.map(toPublicProduct) });
    },

    "POST /api/login": async (request, url) => {
      const user = await requireUser(request);
      const targets = readTargets(url);
      const profile = {
        uid: user.uid,
        email: user.email || null,
        name: user.name || null,
        photoUrl: user.photoUrl || null,
      };

      const results = await fanOut(targets, (db) => db.upsertUser(profile));
      const summary = { uid: profile.uid, email: profile.email, name: profile.name };

      if (!results.some((result) => result.state === "ok")) {
        throw new HttpError(503, nothingSavedMessage("your sign in", results), {
          user: summary,
          results,
        });
      }
      return json({ user: summary, results });
    },

    "POST /api/orders": async (request, url) => {
      const user = await requireUser(request);
      const targets = readTargets(url);
      const { error, value } = validateOrderInput(await readJson(request));
      if (error) throw new HttpError(400, error);

      const items = value.items.map(({ productId, quantity }) => {
        const product = findProduct(productId);
        return { productId, name: product.name, unitPrice: product.price, quantity };
      });
      const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      const id = crypto.randomUUID();
      const input = {
        id,
        user: { uid: user.uid, email: user.email || null, name: user.name || null },
        items,
        total,
        currency: CURRENCY,
      };

      const results = await fanOut(targets, (db) => db.createOrder(input));
      const saved = results.find((result) => result.state === "ok");
      if (!saved) {
        throw new HttpError(503, nothingSavedMessage("your order", results), {
          results,
        });
      }

      const order = {
        id,
        userUid: user.uid,
        total,
        currency: CURRENCY,
        status: "placed",
        createdAt: saved.data?.createdAt || new Date().toISOString(),
        items,
      };
      return json({ order, results }, 201);
    },

    "GET /api/orders": async (request, url) => {
      const user = await requireUser(request);
      const from = readSource(url);
      const read = await readWithFallback(databases, from, (db) => db.listOrdersForUser(user.uid));
      if (!read) throw new HttpError(503, "Could not load your orders from any database. Try again soon.");
      return json({ source: read.source, orders: read.data });
    },
  };

  return async function api(request) {
    const cors = corsHeaders(request);

    function withCors(response) {
      for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
      return response;
    }

    try {
      const url = new URL(request.url);
      const path = normalisePath(url.pathname);

      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      const route = routes[`${request.method} ${path}`];

      if (!route) {
        const knownPath = Object.keys(routes).some((key) => key.endsWith(` ${path}`));
        if (knownPath) throw new HttpError(405, `${request.method} is not allowed on ${path}.`);
        throw new HttpError(404, `No API route at ${path}.`);
      }
      return withCors(await route(request, url));
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(json({ error: error.message, ...error.extra }, error.status));
      }
      console.error(error);
      return withCors(
        json({ error: "Something went wrong on the server. Check the function logs." }, 500)
      );
    }
  };
}
