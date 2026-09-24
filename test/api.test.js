import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";

import { setApiForTesting } from "../server/runtime.js";
import { createApi } from "../server/handlers.js";
import { createDatabases } from "../server/databases.js";
import { CATALOG } from "../server/catalog.js";
import { createFakeAdapters, ALL_ENV, fakeVerifyIdToken } from "./fakes.js";

import * as health from "../api/health.js";
import * as products from "../api/products.js";
import * as login from "../api/login.js";
import * as orders from "../api/orders.js";
import netlifyFunction from "../netlify/functions/api.mjs";

const BASE = "http://localhost";
const SAVED_ENV = { ...process.env };

before(() => {
  mock.method(console, "error", () => {});
  mock.method(console, "warn", () => {});
});

after(() => {
  setApiForTesting(null);
  process.env = SAVED_ENV;
  mock.restoreAll();
});

function setup({ env = ALL_ENV, primaryId = "firebase" } = {}) {
  const fakes = createFakeAdapters();
  const databases = createDatabases(
    [fakes.firebase.adapter, fakes.cockroachdb.adapter, fakes.mysql.adapter],
    { catalog: CATALOG, env }
  );
  setApiForTesting(createApi({ databases, verifyIdToken: fakeVerifyIdToken, primaryId }));
  return fakes;
}

function request(path, { method = "GET", token, body, origin } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (origin) headers.origin = origin;
  return new Request(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function placeOrder(items, token = "token-alice") {
  return orders.POST(request("/api/orders", { method: "POST", token, body: { items } }));
}

function placeOrderTo(to) {
  const items = [{ productId: "product-6", quantity: 1 }];
  return orders.POST(request(`/api/orders?to=${to}`, { method: "POST", token: "token-alice", body: { items } }));
}

test("health pings every database and reports the primary", async () => {
  const fakes = setup({ env: { FAKE_FIREBASE_KEY: "x", FAKE_MYSQL_URL: "x" } });
  fakes.mysql.control.down = true;

  const res = await health.GET(request("/api/health"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^application\/json/);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.primary, "firebase");
  assert.deepEqual(
    body.databases.map((d) => [d.id, d.state]),
    [["firebase", "ok"], ["cockroachdb", "not_configured"], ["mysql", "error"]]
  );
  assert.deepEqual(body.databases[1].missingEnv, ["FAKE_COCKROACH_URL"]);
});

test("a database error never leaks the driver message or secrets", async () => {
  const fakes = setup();
  fakes.cockroachdb.control.down = true;
  const text = await (await health.GET(request("/api/health"))).text();
  assert.doesNotMatch(text, /hunter2|postgresql:|ECONNREFUSED/);
  assert.match(text, /Could not reach CockroachDB/);
});

test("products come from the primary database, or the one in ?from=", async () => {
  setup();
  const res = await products.GET(request("/api/products"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "firebase");
  assert.equal(body.products.length, 8);
  assert.deepEqual(Object.keys(body.products[0]).sort(), ["category", "description", "id", "image", "name", "price"]);

  const fromMysql = await (await products.GET(request("/api/products?from=mysql"))).json();
  assert.equal(fromMysql.source, "mysql");
});

test("products fall back to the next working database in a fixed order", async () => {
  const fakes = setup({ primaryId: "mysql" });
  fakes.mysql.control.down = true;
  fakes.firebase.control.down = true;
  const body = await (await products.GET(request("/api/products"))).json();
  assert.equal(body.source, "cockroachdb");
});

test("products fall back to the built in catalog when no database works", async () => {
  const fakes = setup({ env: { FAKE_MYSQL_URL: "x" } });
  fakes.mysql.control.down = true;
  const res = await products.GET(request("/api/products"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "catalog");
  assert.equal(body.products.length, CATALOG.length);
  assert.equal(body.products[0].position, undefined);
  assert.deepEqual(body.products.map((p) => p.name), ["Product 1", "Product 2", "Product 3", "Product 4", "Product 5", "Product 6", "Product 7", "Product 8"]);
  assert.equal(body.products[0].image, "/images/product-1.svg");
});

test("an unknown ?from= is a 400", async () => {
  setup();
  const res = await products.GET(request("/api/products?from=oracle"));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unknown database "oracle"/);

  const res2 = await orders.GET(request("/api/orders?from=mongo", { token: "token-alice" }));
  assert.equal(res2.status, 400);
});

test("login saves the user in every database and counts logins", async () => {
  const fakes = setup();
  await login.POST(request("/api/login", { method: "POST", token: "token-alice" }));
  const res = await login.POST(request("/api/login", { method: "POST", token: "token-alice" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.user, { uid: "alice", email: "alice@example.com", name: "Alice" });
  assert.equal(body.results.length, 3);
  for (const result of body.results) {
    assert.equal(result.state, "ok");
    assert.equal(result.data.loginCount, 2);
  }
  assert.equal(fakes.mysql.control.users.get("alice").loginCount, 2);
});

test("login still succeeds when one database is down", async () => {
  const fakes = setup();
  fakes.cockroachdb.control.down = true;
  const res = await login.POST(request("/api/login", { method: "POST", token: "token-bob" }));
  assert.equal(res.status, 200);
  const states = Object.fromEntries((await res.json()).results.map((r) => [r.id, r.state]));
  assert.deepEqual(states, { firebase: "ok", cockroachdb: "error", mysql: "ok" });
  assert.ok(fakes.firebase.control.users.has("bob"));
});

test("login is a 503 when no database is configured", async () => {
  setup({ env: {} });
  const res = await login.POST(request("/api/login", { method: "POST", token: "token-alice" }));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(body.error, /any database/);
  assert.ok(body.results.every((r) => r.state === "not_configured"));
});

test("?to= saves a login and an order to only the chosen database", async () => {
  const fakes = setup();
  const res = await login.POST(request("/api/login?to=cockroachdb", { method: "POST", token: "token-alice" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.results.map((r) => [r.id, r.state]), [["cockroachdb", "ok"]]);
  assert.ok(fakes.cockroachdb.control.users.has("alice"));
  assert.equal(fakes.firebase.control.users.size, 0);
  assert.equal(fakes.mysql.control.users.size, 0);

  const orderRes = await placeOrderTo("mysql");
  assert.equal(orderRes.status, 201);
  const { order, results } = await orderRes.json();
  assert.deepEqual(results.map((r) => r.id), ["mysql"]);
  assert.equal(fakes.mysql.control.orders[0].id, order.id);
  assert.equal(fakes.firebase.control.orders.length, 0);
  assert.equal(fakes.cockroachdb.control.orders.length, 0);
});

test("an unknown ?to= is a 400", async () => {
  const fakes = setup();
  const res = await login.POST(request("/api/login?to=oracle", { method: "POST", token: "token-alice" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Unknown database "oracle"/);

  const res2 = await placeOrderTo("mongo");
  assert.equal(res2.status, 400);
  assert.equal(fakes.firebase.control.orders.length, 0);
});

test("?to= a database that is not set up (or down) is a 503, even if others work", async () => {
  const fakes = setup({ env: { FAKE_FIREBASE_KEY: "x", FAKE_MYSQL_URL: "x" } });
  const res = await login.POST(request("/api/login?to=cockroachdb", { method: "POST", token: "token-alice" }));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.match(body.error, /CockroachDB is not set up/);
  assert.deepEqual(body.results.map((r) => [r.id, r.state]), [["cockroachdb", "not_configured"]]);
  assert.equal(fakes.firebase.control.users.size, 0);

  fakes.mysql.control.down = true;
  const orderRes = await placeOrderTo("mysql");
  assert.equal(orderRes.status, 503);
  assert.deepEqual((await orderRes.json()).results.map((r) => [r.id, r.state]), [["mysql", "error"]]);
  assert.equal(fakes.firebase.control.orders.length, 0);
});

test("sign in is required, and a bad token is rejected", async () => {
  setup();
  const noToken = await login.POST(request("/api/login", { method: "POST" }));
  assert.equal(noToken.status, 401);
  assert.equal((await noToken.json()).error, "Sign in to continue.");

  const badToken = await orders.GET(request("/api/orders", { token: "token-mallory" }));
  assert.equal(badToken.status, 401);
  assert.equal((await badToken.json()).error, "Your session has expired. Sign in again.");
});

test("an order uses catalog prices, merges duplicate lines and is saved everywhere with one id", async () => {
  const fakes = setup();
  const res = await placeOrder([
    { productId: "product-1", quantity: 1, price: 1 },
    { productId: "product-8", quantity: 2, unitPrice: 0 },
    { productId: "product-1", quantity: 2 },
  ]);
  assert.equal(res.status, 201);
  const { order, results } = await res.json();

  assert.equal(order.total, 10000 * 3 + 80000 * 2);
  assert.equal(order.currency, "INR");
  assert.equal(order.status, "placed");
  assert.deepEqual(order.items, [
    { productId: "product-1", name: "Product 1", unitPrice: 10000, quantity: 3 },
    { productId: "product-8", name: "Product 8", unitPrice: 80000, quantity: 2 },
  ]);
  assert.match(order.id, /^[0-9a-f-]{36}$/);
  assert.ok(results.every((r) => r.state === "ok"));
  for (const fake of [fakes.firebase, fakes.cockroachdb, fakes.mysql]) {
    assert.equal(fake.control.orders[0].id, order.id);
  }
});

test("bad orders are rejected with a clear message", async () => {
  setup();
  const cases = [
    [{}, /items/],
    [[], /items/],
    [{ items: [] }, /empty/],
    [{ items: Array.from({ length: 21 }, () => ({ productId: "product-8", quantity: 1 })) }, /at most 20/],
    [{ items: [{ productId: "unicorn", quantity: 1 }] }, /not on the menu/],
    [{ items: [{ productId: "product-8", quantity: 0 }] }, /1 to 10/],
    [{ items: [{ productId: "product-8", quantity: 11 }] }, /1 to 10/],
    [{ items: [{ productId: "product-8", quantity: 1.5 }] }, /1 to 10/],
    [{ items: [{ productId: "product-8", quantity: 6 }, { productId: "product-8", quantity: 5 }] }, /at most 10/],
    [{ items: ["product-8"] }, /productId, quantity/],
  ];
  for (const [body, message] of cases) {
    const res = await orders.POST(request("/api/orders", { method: "POST", token: "token-alice", body }));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await res.json()).error, message);
  }

  const badJson = await orders.POST(request("/api/orders", { method: "POST", token: "token-alice", body: "{nope" }));
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error, "Request body must be JSON.");
});

test("an order is a 503 when every database fails", async () => {
  const fakes = setup();
  for (const fake of Object.values(fakes)) fake.control.down = true;
  const res = await placeOrder([{ productId: "product-6", quantity: 1 }]);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).results.length, 3);
});

test("orders are listed per user, newest first, from ?from= with fallback", async () => {
  const fakes = setup();
  await placeOrder([{ productId: "product-6", quantity: 1 }]);
  await placeOrder([{ productId: "product-4", quantity: 2 }]);
  await placeOrder([{ productId: "product-8", quantity: 1 }], "token-bob");

  const mine = await (await orders.GET(request("/api/orders?from=cockroachdb", { token: "token-alice" }))).json();
  assert.equal(mine.source, "cockroachdb");
  assert.deepEqual(mine.orders.map((o) => o.items[0].productId), ["product-4", "product-6"]);

  fakes.cockroachdb.control.down = true;
  const fallback = await (await orders.GET(request("/api/orders?from=cockroachdb", { token: "token-alice" }))).json();
  assert.equal(fallback.source, "firebase");

  for (const fake of Object.values(fakes)) fake.control.down = true;
  const none = await orders.GET(request("/api/orders", { token: "token-alice" }));
  assert.equal(none.status, 503);
});

test("init runs once per database and is retried after a failure", async () => {
  const fakes = setup();
  fakes.mysql.control.down = true;
  await health.GET(request("/api/health"));
  await health.GET(request("/api/health"));
  assert.equal(fakes.firebase.control.initCalls, 1);
  assert.equal(fakes.mysql.control.initCalls, 2);

  fakes.mysql.control.down = false;
  const body = await (await health.GET(request("/api/health"))).json();
  assert.equal(body.databases.find((d) => d.id === "mysql").state, "ok");
  assert.equal(fakes.mysql.control.products.length, 8);
});

test("unknown paths are 404 and wrong methods are 405, also through Netlify", async () => {
  setup();
  const missing = await netlifyFunction(request("/api/nothing"));
  assert.equal(missing.status, 404);

  const wrong = await netlifyFunction(request("/.netlify/functions/api/login"));
  assert.equal(wrong.status, 405);

  const ok = await netlifyFunction(request("/api/products/"));
  assert.equal(ok.status, 200);
});

test("CORS: preflight is answered and the allow list is respected", async () => {
  setup();
  delete process.env.ALLOWED_ORIGINS;
  const preflight = await orders.OPTIONS(
    request("/api/orders", { method: "OPTIONS", origin: "https://shop.example" })
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);

  process.env.ALLOWED_ORIGINS = "https://shop.example/, http://localhost:5500";
  const allowed = await products.GET(request("/api/products", { origin: "https://shop.example" }));
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://shop.example");
  assert.equal(allowed.headers.get("vary"), "Origin");

  const blocked = await products.GET(request("/api/products", { origin: "https://evil.example" }));
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  delete process.env.ALLOWED_ORIGINS;
});

test("a missing FIREBASE_PROJECT_ID is a 500 that names the variable", async () => {
  setApiForTesting(null);
  delete process.env.FIREBASE_PROJECT_ID;
  const res = await health.GET(request("/api/health"));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /FIREBASE_PROJECT_ID/);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});
