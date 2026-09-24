import { useAuth } from "../auth/AuthContext.jsx";
import { MAX_QUANTITY } from "../lib/cart.js";
import { formatPrice } from "../lib/format.js";

export default function CartPanel({ lines, total, onSetQuantity, onPlaceOrder, placing, onSignIn, signingIn }) {
  const { user } = useAuth();

  return (
    <aside id="cart" aria-labelledby="cart-title">
      <h2 id="cart-title">Cart</h2>

      {lines.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ product, quantity }) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>
                    <select
                      aria-label={`Quantity of ${product.name}`}
                      value={quantity}
                      onChange={(event) => onSetQuantity(product.id, Number(event.target.value))}
                    >
                      {Array.from({ length: MAX_QUANTITY }, (_, index) => index + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{formatPrice(product.price * quantity)}</td>
                  <td>
                    <button type="button" onClick={() => onSetQuantity(product.id, 0)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            <strong>Total: {formatPrice(total)}</strong>
          </p>

          {user ? (
            <button type="button" onClick={onPlaceOrder} disabled={placing}>
              {placing ? "Placing order…" : "Place order"}
            </button>
          ) : (
            <>
              <p>Sign in to place your order.</p>
              <button type="button" onClick={onSignIn} disabled={signingIn}>
                {signingIn ? "Signing in…" : "Sign in with Google"}
              </button>
            </>
          )}
        </>
      )}
    </aside>
  );
}
