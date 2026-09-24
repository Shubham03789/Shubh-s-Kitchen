import { useAuth } from "../auth/AuthContext.jsx";
import { STORE_NAME } from "../config.js";
import { signOutUser } from "../lib/firebase.js";
import DbPicker from "./DbPicker.jsx";

export default function Header({ view, onNavigate, cartCount, onOpenCart, onSignIn, signingIn, db }) {
  const { user, ready } = useAuth();

  return (
    <header>
      <h1>{STORE_NAME}</h1>

      <nav aria-label="Main">
        <button type="button" aria-current={view === "shop" ? "page" : undefined} onClick={() => onNavigate("shop")}>
          Shop
        </button>
        <button type="button" aria-current={view === "orders" ? "page" : undefined} onClick={() => onNavigate("orders")}>
          My orders
        </button>
        <button type="button" onClick={onOpenCart}>
          Cart ({cartCount})
        </button>

        {ready && user && (
          <>
            <span>{user.displayName || user.email || "Signed in"}</span>
            <button type="button" onClick={() => signOutUser()}>
              Sign out
            </button>
          </>
        )}
        {ready && !user && (
          <button type="button" onClick={onSignIn} disabled={signingIn}>
            {signingIn ? "Signing in…" : "Sign in with Google"}
          </button>
        )}
      </nav>

      <DbPicker {...db} />
      <hr />
    </header>
  );
}
