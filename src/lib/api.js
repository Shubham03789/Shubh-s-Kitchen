import { getIdToken } from "./firebase.js";

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${await getIdToken()}`;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your internet connection and try again.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data && data.error ? data.error : `The server answered with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    if (data && Array.isArray(data.results)) error.results = data.results;
    throw error;
  }
  return data;
}

function withParam(path, name, value) {
  return value ? `${path}?${name}=${encodeURIComponent(value)}` : path;
}

export function getHealth() {
  return request("/api/health");
}

export function getProducts(from) {
  return request(withParam("/api/products", "from", from));
}

export function login({ to } = {}) {
  return request(withParam("/api/login", "to", to), { method: "POST", auth: true });
}

export function placeOrder(items, { to } = {}) {
  return request(withParam("/api/orders", "to", to), { method: "POST", auth: true, body: { items } });
}

export function getMyOrders(from) {
  return request(withParam("/api/orders", "from", from), { auth: true });
}
