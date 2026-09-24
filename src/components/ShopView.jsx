import { useEffect, useState } from "react";
import { getProducts, placeOrder } from "../lib/api.js";
import { fallbackNote, sourceLabel, shortId } from "../lib/format.js";
import CartPanel from "./CartPanel.jsx";
import ProductCard from "./ProductCard.jsx";

export default function ShopView({ cart, from, selectedDb, selectedState, writeTo, onResult, onSignIn, signingIn }) {
  const [products, setProducts] = useState([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [placing, setPlacing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setLoadError("");
    getProducts(from || undefined)
      .then((data) => {
        if (ignore) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setSource(data.source || "");
      })
      .catch((error) => {
        if (!ignore) setLoadError(error.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey, from]);

  const lines = products
    .filter((product) => cart.cart[product.id])
    .map((product) => ({ product, quantity: cart.cart[product.id] }));
  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  const fellBack = Boolean(selectedDb && source && source !== selectedDb);

  async function handlePlaceOrder() {
    setPlacing(true);
    try {
      const items = lines.map(({ product, quantity }) => ({ productId: product.id, quantity }));
      const data = await placeOrder(items, { to: writeTo });
      cart.clear();
      onResult({ title: `Order ${shortId(data.order && data.order.id)} saved to:`, results: data.results });
    } catch (error) {
      onResult({ title: "Your order was not saved", results: error.results, error: error.message });
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="shop">
      <section aria-labelledby="shop-title">
        <h2 id="shop-title">Shop</h2>

        {source && !loading && (
          <p>{fellBack ? fallbackNote(selectedDb, source, selectedState) : `Products read from ${sourceLabel(source)}.`}</p>
        )}

        {loading && <p>Loading products…</p>}

        {!loading && loadError && (
          <p role="alert">
            {loadError}{" "}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </p>
        )}

        {!loading && !loadError && products.length === 0 && <p>No products yet.</p>}

        <div className="products">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} inCart={cart.cart[product.id] || 0} onAdd={cart.add} />
          ))}
        </div>
      </section>

      <CartPanel
        lines={lines}
        total={total}
        onSetQuantity={cart.setQuantity}
        onPlaceOrder={handlePlaceOrder}
        placing={placing}
        onSignIn={onSignIn}
        signingIn={signingIn}
      />
    </div>
  );
}
