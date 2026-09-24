import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAdminApp } from "../../server/firebase-admin.js";

export const id = "firebase";
export const label = "Firebase Firestore";
export const requiredEnv = ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];

function toIso(timestamp) {
  return timestamp && typeof timestamp.toDate === "function" ? timestamp.toDate().toISOString() : null;
}

function toProduct(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    price: Number(data.price),
    image: data.image,
    category: data.category,
  };
}

function toUser(doc) {
  const data = doc.data();
  return {
    uid: doc.id,
    email: data.email ?? null,
    name: data.name ?? null,
    photoUrl: data.photoUrl ?? null,
    loginCount: Number(data.loginCount),
    createdAt: toIso(data.createdAt),
    lastLoginAt: toIso(data.lastLoginAt),
  };
}

function toOrder(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    userUid: data.userUid,
    total: Number(data.total),
    currency: data.currency,
    status: data.status,
    createdAt: toIso(data.createdAt),
    items: (data.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
    })),
  };
}

export function createDb() {
  let firestore = null;
  const store = () => (firestore ??= getFirestore(getAdminApp()));
  const users = () => store().collection("users");
  const products = () => store().collection("products");
  const orders = () => store().collection("orders");

  return {
    async init(catalogProducts) {
      const batch = store().batch();
      for (const product of catalogProducts) {
        batch.set(
          products().doc(product.id),
          {
            position: product.position,
            name: product.name,
            description: product.description,
            price: product.price,
            image: product.image,
            category: product.category,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      await batch.commit();
    },

    async ping() {
      await products().limit(1).get();
    },

    async upsertUser({ uid, email, name, photoUrl }) {
      const ref = users().doc(uid);
      await store().runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const profile = { email: email ?? null, name: name ?? null, photoUrl: photoUrl ?? null };
        if (!snapshot.exists) {
          tx.set(ref, {
            ...profile,
            loginCount: 1,
            createdAt: FieldValue.serverTimestamp(),
            lastLoginAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(ref, {
            ...profile,
            loginCount: FieldValue.increment(1),
            lastLoginAt: FieldValue.serverTimestamp(),
          });
        }
      });
      return toUser(await ref.get());
    },

    async listProducts() {
      const snapshot = await products().orderBy("position").get();
      return snapshot.docs.map(toProduct);
    },

    async createOrder({ id: orderId, user, items, total, currency }) {
      const userRef = users().doc(user.uid);
      const orderRef = orders().doc(orderId);

      await store().runTransaction(async (tx) => {
        const [userSnap, orderSnap] = await Promise.all([tx.get(userRef), tx.get(orderRef)]);
        if (orderSnap.exists) {
          throw new Error("An order with this id already exists.");
        }

        if (!userSnap.exists) {
          tx.create(userRef, {
            email: user.email ?? null,
            name: user.name ?? null,
            photoUrl: null,
            loginCount: 1,
            createdAt: FieldValue.serverTimestamp(),
            lastLoginAt: FieldValue.serverTimestamp(),
          });
        }

        tx.create(orderRef, {
          userUid: user.uid,
          userEmail: user.email ?? null,
          total,
          currency,
          status: "placed",
          items: items.map((item) => ({
            productId: item.productId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      return toOrder(await orderRef.get());
    },

    async listOrdersForUser(uid) {
      const snapshot = await orders().where("userUid", "==", uid).get();
      return snapshot.docs
        .map(toOrder)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
  };
}
