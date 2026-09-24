export function createFakeAdapter({ id, label, requiredEnv = [] }) {
  const control = { down: false, initCalls: 0, users: new Map(), orders: [], products: [] };
  const copy = (value) => structuredClone(value);

  function check() {
    if (control.down) {
      throw new Error(`connect ECONNREFUSED postgresql://admin:hunter2@${id}.example.com`);
    }
  }

  const adapter = {
    id,
    label,
    requiredEnv,
    createDb() {
      return {
        async init(products) {
          control.initCalls += 1;
          check();
          control.products = products.map(copy);
        },
        async ping() {
          check();
        },
        async upsertUser({ uid, email, name, photoUrl }) {
          check();
          const now = new Date().toISOString();
          const existing = control.users.get(uid);
          const user = existing
            ? { ...existing, email, name, photoUrl, loginCount: existing.loginCount + 1, lastLoginAt: now }
            : { uid, email, name, photoUrl, loginCount: 1, createdAt: now, lastLoginAt: now };
          control.users.set(uid, user);
          return copy(user);
        },
        async listProducts() {
          check();
          return [...control.products]
            .sort((a, b) => a.position - b.position)
            .map(({ id, name, description, price, image, category }) => ({
              id, name, description, price, image, category,
            }));
        },
        async createOrder({ id: orderId, user, items, total, currency }) {
          check();
          const order = {
            id: orderId,
            userUid: user.uid,
            total,
            currency,
            status: "placed",
            createdAt: new Date(Date.now() + control.orders.length).toISOString(),
            items: copy(items),
          };
          control.orders.push(order);
          return copy(order);
        },
        async listOrdersForUser(uid) {
          check();
          return control.orders
            .filter((order) => order.userUid === uid)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(copy);
        },
      };
    },
  };

  return { adapter, control };
}

export function createFakeAdapters() {
  return {
    firebase: createFakeAdapter({ id: "firebase", label: "Firebase Firestore", requiredEnv: ["FAKE_FIREBASE_KEY"] }),
    cockroachdb: createFakeAdapter({ id: "cockroachdb", label: "CockroachDB", requiredEnv: ["FAKE_COCKROACH_URL"] }),
    mysql: createFakeAdapter({ id: "mysql", label: "MySQL (Aiven)", requiredEnv: ["FAKE_MYSQL_URL"] }),
  };
}

export const ALL_ENV = { FAKE_FIREBASE_KEY: "x", FAKE_COCKROACH_URL: "x", FAKE_MYSQL_URL: "x" };

const USERS = {
  "token-alice": { uid: "alice", email: "alice@example.com", name: "Alice", photoUrl: null },
  "token-bob": { uid: "bob", email: "bob@example.com", name: "Bob", photoUrl: null },
};

export async function fakeVerifyIdToken(token) {
  const user = USERS[token];
  if (!user) throw new Error("Invalid token");
  return { ...user };
}
