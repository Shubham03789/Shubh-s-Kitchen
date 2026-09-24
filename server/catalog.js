export const CURRENCY = "INR";
export const STORE_NAME = "Store Name";

export const CATALOG = [
  {
    id: "product-1",
    position: 1,
    name: "Product 1",
    description: "Description of product 1",
    price: 10000,
    image: "/images/product-1.svg",
    category: "Category 1",
  },
  {
    id: "product-2",
    position: 2,
    name: "Product 2",
    description: "Description of product 2",
    price: 20000,
    image: "/images/product-2.svg",
    category: "Category 1",
  },
  {
    id: "product-3",
    position: 3,
    name: "Product 3",
    description: "Description of product 3",
    price: 30000,
    image: "/images/product-3.svg",
    category: "Category 1",
  },
  {
    id: "product-4",
    position: 4,
    name: "Product 4",
    description: "Description of product 4",
    price: 40000,
    image: "/images/product-4.svg",
    category: "Category 2",
  },
  {
    id: "product-5",
    position: 5,
    name: "Product 5",
    description: "Description of product 5",
    price: 50000,
    image: "/images/product-5.svg",
    category: "Category 2",
  },
  {
    id: "product-6",
    position: 6,
    name: "Product 6",
    description: "Description of product 6",
    price: 60000,
    image: "/images/product-6.svg",
    category: "Category 2",
  },
  {
    id: "product-7",
    position: 7,
    name: "Product 7",
    description: "Description of product 7",
    price: 70000,
    image: "/images/product-7.svg",
    category: "Category 3",
  },
  {
    id: "product-8",
    position: 8,
    name: "Product 8",
    description: "Description of product 8",
    price: 80000,
    image: "/images/product-8.svg",
    category: "Category 3",
  },
];

export function findProduct(id) {
  return CATALOG.find((product) => product.id === id) || null;
}

export function toPublicProduct({ id, name, description, price, image, category }) {
  return { id, name, description, price, image, category };
}
