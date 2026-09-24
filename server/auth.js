import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "./firebase-admin.js";

export function createFirebaseVerifier() {
  return async (token) => {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      photoUrl: decoded.picture || null,
    };
  };
}
