import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { getMyOrders } from "../lib/api.js";
import { fallbackNote, formatDate, formatPrice, shortId, sourceLabel } from "../lib/format.js";

export default function OrdersView({ from, selectedDb, selectedState, onSignIn, signingIn, onBrowse }) {
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const uid = user ? user.uid : null;

  useEffect(() => {
    if (!uid) return undefined;
    let ignore = false;
    setLoading(true);
    setError("");
    getMyOrders(from || undefined)
      .then((data) => {
        if (ignore) return;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setSource(data.source || "");
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message);
        setOrders([]);
        setSource("");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [uid, from]);

  if (!ready) {
    return (
      <section>
        <h2>My orders</h2>
        <p>Checking who is signed in…</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section>
        <h2>My orders</h2>
        <p>Sign in to see your orders.</p>
        <button type="button" onClick={onSignIn} disabled={signingIn}>
          {signingIn ? "Signing in…" : "Sign in with Google"}
        </button>
      </section>
    );
  }

  const fellBack = Boolean(selectedDb && source && source !== selectedDb);

  return (
    <section>
      <h2>My orders</h2>

      {source && !loading && (
        <p>{fellBack ? fallbackNote(selectedDb, source, selectedState) : `Orders read from ${sourceLabel(source)}.`}</p>
      )}

      {loading && <p>Loading your orders…</p>}
      {!loading && error && <p role="alert">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <p>
          No orders yet.{" "}
          <button type="button" onClick={onBrowse}>
            Go to the Shop
          </button>
        </p>
      )}

      {!loading && orders.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Items</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td title={order.id}>{shortId(order.id)}</td>
                <td>{formatDate(order.createdAt)}</td>
                <td>
                  <ul>
                    {(order.items || []).map((item) => (
                      <li key={item.productId}>
                        {item.quantity} × {item.name} ({formatPrice(item.unitPrice * item.quantity)})
                      </li>
                    ))}
                  </ul>
                </td>
                <td>{order.status || "placed"}</td>
                <td>{formatPrice(order.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
