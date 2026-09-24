import mysql from "mysql2/promise";

export const id = "mysql";
export const label = "MySQL (Aiven)";
export const requiredEnv = ["MYSQL_DATABASE_URL"];

const TABLE_OPTIONS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    uid VARCHAR(128) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NULL,
    name VARCHAR(255) NULL,
    photo_url VARCHAR(1024) NULL,
    login_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    position INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NOT NULL,
    price INT NOT NULL,
    image VARCHAR(255) NULL,
    category VARCHAR(40) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS orders (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_uid VARCHAR(128) NOT NULL,
    total INT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(20) NOT NULL DEFAULT 'placed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_orders_user_created (user_uid, created_at),
    FOREIGN KEY (user_uid) REFERENCES users (uid)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS order_items (
    order_id CHAR(36) NOT NULL,
    product_id VARCHAR(64) NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    unit_price INT NOT NULL,
    quantity INT NOT NULL,
    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
  ) ${TABLE_OPTIONS}`,
];

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    image: row.image,
    category: row.category,
  };
}

function toUser(row) {
  return {
    uid: row.uid,
    email: row.email ?? null,
    name: row.name ?? null,
    photoUrl: row.photo_url ?? null,
    loginCount: Number(row.login_count),
    createdAt: toIso(row.created_at),
    lastLoginAt: toIso(row.last_login_at),
  };
}

function toItem(row) {
  return {
    productId: row.product_id,
    name: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
  };
}

function toOrder(row, items) {
  return {
    id: row.id,
    userUid: row.user_uid,
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    createdAt: toIso(row.created_at),
    items,
  };
}

function sslOptions(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1") return undefined;
  const ca = process.env.MYSQL_CA_CERT;
  if (ca) return { ca: ca.replace(/\\n/g, "\n") };
  return { rejectUnauthorized: false };
}

function makePool() {
  let url;
  try {
    url = new URL(process.env.MYSQL_DATABASE_URL);
  } catch {
    throw new Error("MYSQL_DATABASE_URL is not a valid mysql:// URL.");
  }

  const pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || "defaultdb",
    connectionLimit: 2,
    timezone: "Z",
    charset: "utf8mb4",
    ssl: sslOptions(url.hostname),
  });

  pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) console.error("Could not set the MySQL time zone:", error.message);
    });
  });

  return pool;
}

export function createDb() {
  let pool = null;
  function getPool() {
    if (!pool) pool = makePool();
    return pool;
  }

  return {
    async init(products) {
      const db = getPool();
      for (const sql of CREATE_TABLES) await db.query(sql);
      if (!products || products.length === 0) return;

      const rows = products.map((p) => [
        p.id, p.position, p.name, p.description, p.price, p.image ?? null, p.category,
      ]);
      await db.query(
        `INSERT INTO products (id, position, name, description, price, image, category)
         VALUES ? AS new
         ON DUPLICATE KEY UPDATE
           position = new.position,
           name = new.name,
           description = new.description,
           price = new.price,
           image = new.image,
           category = new.category,
           updated_at = CURRENT_TIMESTAMP`,
        [rows]
      );
    },

    async ping() {
      await getPool().query("SELECT 1");
    },

    async upsertUser({ uid, email, name, photoUrl }) {
      const db = getPool();
      await db.query(
        `INSERT INTO users (uid, email, name, photo_url, login_count)
         VALUES (?, ?, ?, ?, 1) AS new
         ON DUPLICATE KEY UPDATE
           email = new.email,
           name = new.name,
           photo_url = new.photo_url,
           login_count = users.login_count + 1,
           last_login_at = CURRENT_TIMESTAMP`,
        [uid, email ?? null, name ?? null, photoUrl ?? null]
      );
      const [rows] = await db.query("SELECT * FROM users WHERE uid = ?", [uid]);
      return toUser(rows[0]);
    },

    async listProducts() {
      const [rows] = await getPool().query("SELECT * FROM products ORDER BY position");
      return rows.map(toProduct);
    },

    async createOrder({ id: orderId, user, items, total, currency }) {
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();

        await connection.query(
          "INSERT IGNORE INTO users (uid, email, name, login_count) VALUES (?, ?, ?, 1)",
          [user.uid, user.email ?? null, user.name ?? null]
        );

        await connection.query(
          "INSERT INTO orders (id, user_uid, total, currency, status) VALUES (?, ?, ?, ?, 'placed')",
          [orderId, user.uid, total, currency]
        );

        if (items.length > 0) {
          const rows = items.map((item) => [
            orderId, item.productId, item.name, item.unitPrice, item.quantity,
          ]);
          await connection.query(
            "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity) VALUES ?",
            [rows]
          );
        }

        const [orderRows] = await connection.query("SELECT * FROM orders WHERE id = ?", [orderId]);

        await connection.commit();
        return toOrder(orderRows[0], items.map((item) => ({
          productId: item.productId,
          name: item.name,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity),
        })));
      } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
      } finally {
        connection.release();
      }
    },

    async listOrdersForUser(uid) {
      const db = getPool();
      const [orderRows] = await db.query(
        "SELECT * FROM orders WHERE user_uid = ? ORDER BY created_at DESC, id DESC",
        [uid]
      );
      if (orderRows.length === 0) return [];

      const [itemRows] = await db.query(
        "SELECT * FROM order_items WHERE order_id IN (?) ORDER BY product_name",
        [orderRows.map((row) => row.id)]
      );

      const itemsByOrder = new Map();
      for (const row of itemRows) {
        if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
        itemsByOrder.get(row.order_id).push(toItem(row));
      }
      return orderRows.map((row) => toOrder(row, itemsByOrder.get(row.id) || []));
    },
  };
}
