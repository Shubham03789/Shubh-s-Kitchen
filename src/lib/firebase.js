import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VARIABLE_NAMES = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  appId: "VITE_FIREBASE_APP_ID",
};
export const missingConfig = Object.entries(VARIABLE_NAMES)
  .filter(([key]) => !firebaseConfig[key] || String(firebaseConfig[key]).includes("YOUR_"))
  .map(([, name]) => name);

const SETUP_MESSAGE = `Firebase is not set up yet. Add ${missingConfig.join(", ")} to .env and restart.`;

const app = missingConfig.length === 0 ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;

function requireFirebase() {
  if (!app) throw new Error(SETUP_MESSAGE);
}

export async function signIn() {
  requireFirebase();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  if (auth) await signOut(auth);
}

export async function getIdToken() {
  const user = auth ? auth.currentUser : null;
  if (!user) throw new Error("Sign in to continue.");
  return user.getIdToken();
}

export function signInErrorText(error) {
  const code = error && error.code;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/popup-blocked") return "Your browser blocked the sign in popup. Allow popups for this site and try again.";
  if (code === "auth/unauthorized-domain") {
    return "This domain is not allowed to sign in yet. Add it in Firebase console > Authentication > Settings > Authorized domains.";
  }
  return (error && error.message) || "Sign in failed. Please try again.";
}
