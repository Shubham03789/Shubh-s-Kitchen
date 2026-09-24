import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase.js";

const AuthContext = createContext({ user: null, ready: false });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!auth);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (newUser) => {
      setUser(newUser);
      setReady(true);
    });
  }, []);

  return <AuthContext.Provider value={{ user, ready }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
