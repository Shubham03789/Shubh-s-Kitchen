import { useCallback, useEffect, useState } from "react";
import { AuthProvider } from "./auth/AuthContext.jsx";
import DbResults from "./components/DbResults.jsx";
import Footer from "./components/Footer.jsx";
import Header from "./components/Header.jsx";
import Message from "./components/Message.jsx";
import OrdersView from "./components/OrdersView.jsx";
import SetupNotice from "./components/SetupNotice.jsx";
import ShopView from "./components/ShopView.jsx";
import { getHealth, login } from "./lib/api.js";
import { useCart } from "./lib/cart.js";
import { signIn, signInErrorText } from "./lib/firebase.js";
import { DATABASES } from "./lib/format.js";

const DB_KEY = "store.database";
const SAVE_TO_KEY = "store.saveTo";

function loadSetting(key, allowed) {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value) ? value : "";
  } catch {
    return "";
  }
}

function saveSetting(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function loginCountFrom(results) {
  const ok = (results || []).find((result) => result.state === "ok" && result.data);
  return ok ? ok.data.loginCount : null;
}

function Store() {
  const [view, setView] = useState("shop");
  const cart = useCart();
  const [signingIn, setSigningIn] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "info" });
  const [results, setResults] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [pickedDb, setPickedDb] = useState(() => loadSetting(DB_KEY, DATABASES.map((db) => db.id)));
  const [saveTo, setSaveTo] = useState(() => loadSetting(SAVE_TO_KEY, ["all", "one"]) || "all");

  const primary = health ? health.primary : "";
  const selectedDb = pickedDb || primary;
  const selectedHealth = health && Array.isArray(health.databases)
    ? health.databases.find((db) => db.id === selectedDb)
    : null;
  const selectedState = selectedHealth ? selectedHealth.state : "";
  const writeTo = saveTo === "one" && selectedDb ? selectedDb : undefined;

  function pickDb(id) {
    setPickedDb(id);
    saveSetting(DB_KEY, id);
  }

  function pickSaveTo(value) {
    setSaveTo(value);
    saveSetting(SAVE_TO_KEY, value);
  }

  const refreshHealth = useCallback(() => {
    setHealthError("");
    getHealth()
      .then(setHealth)
      .catch((error) => setHealthError(error.message));
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  async function handleSignIn() {
    setMessage({ text: "" });
    setSigningIn(true);
    try {
      await signIn();
    } catch (error) {
      const text = signInErrorText(error);
      if (text) setMessage({ text, type: "error" });
      setSigningIn(false);
      return;
    }

    try {
      const data = await login({ to: writeTo });
      const count = loginCountFrom(data.results);
      setResults({
        title: "Saved your login to:",
        results: data.results,
        note: count ? `This is login number ${count} for ${(data.user && (data.user.email || data.user.name)) || "you"}.` : "",
      });
    } catch (error) {
      if (error.results) {
        setResults({ title: "Your login was not saved", results: error.results, error: error.message });
      } else {
        setMessage({ text: `Signed in, but the server said: ${error.message}`, type: "error" });
      }
    } finally {
      setSigningIn(false);
      refreshHealth();
    }
  }

  function handleOrderResult(result) {
    setResults(result);
    refreshHealth();
    window.scrollTo({ top: 0 });
  }

  function navigate(nextView) {
    setView(nextView);
    setMessage({ text: "" });
    window.scrollTo({ top: 0 });
  }

  function openCart() {
    setView("shop");
    setTimeout(() => {
      const cartSection = document.getElementById("cart");
      if (cartSection) cartSection.scrollIntoView();
    }, 0);
  }

  return (
    <>
      <Header
        view={view}
        onNavigate={navigate}
        cartCount={cart.count}
        onOpenCart={openCart}
        onSignIn={handleSignIn}
        signingIn={signingIn}
        db={{ value: selectedDb, onChange: pickDb, saveTo, onSaveToChange: pickSaveTo, health }}
      />

      <main>
        <SetupNotice />
        <Message message={message} onClose={() => setMessage({ text: "" })} />
        {results && (
          <DbResults
            title={results.title}
            results={results.results}
            note={results.note}
            error={results.error}
            onClose={() => setResults(null)}
          />
        )}

        {view === "shop" ? (
          <ShopView
            cart={cart}
            from={pickedDb}
            selectedDb={selectedDb}
            selectedState={selectedState}
            writeTo={writeTo}
            onResult={handleOrderResult}
            onSignIn={handleSignIn}
            signingIn={signingIn}
          />
        ) : (
          <OrdersView
            from={pickedDb}
            selectedDb={selectedDb}
            selectedState={selectedState}
            onSignIn={handleSignIn}
            signingIn={signingIn}
            onBrowse={() => navigate("shop")}
          />
        )}
      </main>

      <Footer health={health} healthError={healthError} onRefresh={refreshHealth} writeTo={writeTo} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Store />
    </AuthProvider>
  );
}
