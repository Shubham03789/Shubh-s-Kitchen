# Store Template

In this workshop we build a small online shop. Visitors sign in with Google, browse products, fill a cart and place orders. Every sign in and every order is saved to three databases at the same time: Firebase Firestore, CockroachDB and MySQL. The React site and its API are then deployed on Vercel or Netlify.

## Steps

- Clone this repository
- Install the packages with `npm install`
- Set up Firebase: Google sign in and Firestore
- Set up CockroachDB
- Set up MySQL on Aiven
- Copy `.env.example` to `.env`, fill it in and run the shop locally
- Customise the store name, products and images
- Deploy on Vercel or Netlify

## Scripts

- `npm run dev` starts the site and the API on http://localhost:5173
- `npm run build` builds the site into `dist`
- `npm run preview` serves the built site
- `npm test` runs the API tests
- `npm run check` checks the connection to each database in `.env`
- `npm run setup:firebase` copies the Firebase service account key into `.env`

## Customise

- `server/catalog.js`: store name, currency and products
- `src/config.js`: store name shown on the page, currency and locale
- `public/images`: product images
