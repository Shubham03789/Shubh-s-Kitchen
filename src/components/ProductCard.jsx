import { formatPrice } from "../lib/format.js";

export default function ProductCard({ product, inCart, onAdd }) {
  return (
    <article>
      {product.image && <img src={product.image} alt={product.name} width="400" height="300" />}
      <h3>{product.name}</h3>
      {product.category && <p>{product.category}</p>}
      {product.description && <p>{product.description}</p>}
      <p>
        <strong>{formatPrice(product.price)}</strong>
      </p>
      <button type="button" onClick={() => onAdd(product.id)}>
        Add to cart
      </button>
      {inCart > 0 && <span> In cart: {inCart}</span>}
    </article>
  );
}
