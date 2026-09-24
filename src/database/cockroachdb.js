import pg from "pg";

const { Pool } = pg;

export const id = "cockroachdb";
export const label = "CockroachDB";
export const requiredEnv = ["COCKROACH_DATABASE_URL"];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(128) PRIMARY KEY,
    email TEXT,
    name TEXT,
    photo_url TEXT,
    login_count INT4 NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY,
    position INT4 NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price INT4 NOT NULL CHECK (price > 0),
    image VARCHAR(255),
    category TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    user_uid VARCHAR(128) NOT NULL REFERENCES users (uid),
    total INT4 NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'placed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS orders_user_uid_created_at_idx ON orders (user_uid, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    order_id UUID NOT NULL REFERENCES orders (id),
    product_id VARCHAR(64) NOT NULL REFERENCES products (id),
    product_name TEXT NOT NULL,
    unit_price INT4 NOT NULL,
    quantity INT4 NOT NULL,
    PRIMARY KEY (order_id, product_id)
  )`,
];

const RETRY_CODE = "40001";
const MAX_ATTEMPTS = 3;

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function toProduct(row) {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    price: Number(row.price),
    image: row.image,
    category: row.category,
  };
}

function toUser(row) {
  return {
    uid: String(row.uid),
    email: row.email ?? null,
    name: row.name ?? null,
    photoUrl: row.photo_url ?? null,
    loginCount: Number(row.login_count),
    createdAt: toIso(row.created_at),
    lastLoginAt: toIso(row.last_login_at),
  };
}

function toOrder(row, items) {
  return {
    id: String(row.id),
    userUid: String(row.user_uid),
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    createdAt: toIso(row.created_at),
    items,
  };
}

function toItem(row) {
  return {
    productId: String(row.product_id),
    name: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
  };
}

function placeholders(rowCount, columnCount) {
  const groups = [];
  for (let r = 0; r < rowCount; r++) {
    const cols = [];
    for (let c = 1; c <= columnCount; c++) cols.push(`$${r * columnCount + c}`);
    groups.push(`(${cols.join(", ")})`);
  }
  return groups.join(", ");
}

export function createDb() {
  let connectionString = process.env.COCKROACH_DATABASE_URL;
  let ssl;

  const ca = process.env.COCKROACH_CA_CERT;
  if (ca) {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    connectionString = url.toString();
    ssl = { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  }

  const pool = new Pool({ connectionString, ssl, max: 2, idleTimeoutMillis: 10000 });

  pool.on("error", (error) => {
    console.error("An idle CockroachDB connection was closed:", error.message);
  });

  async function loadOrders(where, params) {
    const { rows: orderRows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY created_at DESC`,
      params
    );
    if (orderRows.length === 0) return [];

    const ids = orderRows.map((row) => String(row.id));
    const { rows: itemRows } = await pool.query(
      "SELECT * FROM order_items WHERE order_id = ANY($1::UUID[]) ORDER BY product_name",
      [ids]
    );

    const itemsByOrder = new Map(ids.map((orderId) => [orderId, []]));
    for (const row of itemRows) {
      itemsByOrder.get(String(row.order_id))?.push(toItem(row));
    }
    return orderRows.map((row) => toOrder(row, itemsByOrder.get(String(row.id))));
  }

  async function writeOrderOnce({ id: orderId, user, items, total, currency }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO users (uid, email, name) VALUES ($1, $2, $3)
         ON CONFLICT (uid) DO NOTHING`,
        [user.uid, user.email ?? null, user.name ?? null]
      );

      await client.query(
        "INSERT INTO orders (id, user_uid, total, currency, status) VALUES ($1, $2, $3, $4, 'placed')",
        [orderId, user.uid, total, currency]
      );

      const values = [];
      for (const item of items) {
        values.push(orderId, item.productId, item.name, item.unitPrice, item.quantity);
      }
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
         VALUES ${placeholders(items.length, 5)}`,
        values
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    async init(products) {
      for (const statement of SCHEMA) {
        await pool.query(statement);
      }
      if (!products || products.length === 0) return;

      const values = [];
      for (const p of products) {
        values.push(p.id, p.position, p.name, p.description, p.price, p.image ?? null, p.category ?? null);
      }
      await pool.query(
        `INSERT INTO products (id, position, name, description, price, image, category)
         VALUES ${placeholders(products.length, 7)}
         ON CONFLICT (id) DO UPDATE SET
           position = excluded.position,
           name = excluded.name,
           description = excluded.description,
           price = excluded.price,
           image = excluded.image,
           category = excluded.category,
           updated_at = now()`,
        values
      );
    },

    async ping() {
      await pool.query("SELECT 1");
    },

    async upsertUser({ uid, email, name, photoUrl }) {
      const { rows } = await pool.query(
        `INSERT INTO users (uid, email, name, photo_url) VALUES ($1, $2, $3, $4)
         ON CONFLICT (uid) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           photo_url = excluded.photo_url,
           login_count = users.login_count + 1,
           last_login_at = now()
         RETURNING *`,
        [uid, email ?? null, name ?? null, photoUrl ?? null]
      );
      return toUser(rows[0]);
    },

    async listProducts() {
      const { rows } = await pool.query("SELECT * FROM products ORDER BY position");
      return rows.map(toProduct);
    },

    async createOrder(order) {
      for (let attempt = 1; ; attempt++) {
        try {
          await writeOrderOnce(order);
          break;
        } catch (error) {
          if (error.code !== RETRY_CODE || attempt >= MAX_ATTEMPTS) throw error;
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
        }
      }
      const [saved] = await loadOrders("id = $1", [order.id]);
      return saved;
    },

    async listOrdersForUser(uid) {
      return loadOrders("user_uid = $1", [uid]);
    },
  };
}
