# Skyzone Community Website — Starter

Responsive community website starter with homepage, digital store, staff, rules, applications, Discord invite links, and server-side product management endpoints.

## Run locally

1. Install Node.js 18 or newer.
2. Open a terminal in this folder and run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set your Discord invite and a long unique `ADMIN_PASSWORD`.
5. Run `npm start` and visit `http://localhost:3000`.

## Store and payments

Sample products are stored in `server/data/products.json`. Update the sample products with your own accurate names, descriptions, prices, and delivery terms.

Secure card checkout is **not connected yet** because you said you do not want Stripe and have not selected another payment provider. The site must use a reputable payment processor's hosted checkout or secure embedded payment fields. Do not build a form that sends raw card numbers, CVCs, or expiry dates to your own server. Never store those details yourself.

Once you choose a provider, its merchant account must be eligible and connected, and its payout settings must be configured so funds go to the correct account. If you are under 18, a parent or guardian will need to handle the eligible account setup where the provider requires it.

## Discord

Set `DISCORD_INVITE_URL` in `.env`. The Join Discord buttons will use that invite.

## Applications

The form prepares an email using `mailto:` and currently uses the placeholder `applications@example.com`. Change the destination in `public/app.js` to the correct application inbox before launch.

## Admin API

The starter exposes password-gated endpoints:
- `GET /api/admin/products`
- `PUT /api/admin/products` with JSON `{ "products": [...] }`
- `GET /api/admin/orders`

Pass the configured password in the `x-admin-password` header. This is a developer starter API, not a finished visual admin dashboard or production-grade account system. Before public launch, add proper owner accounts, roles, rate limiting, CSRF protection, audit logs, backups, and a security review.

## Publishing

This folder is not a live website yet. Deploy it to a Node.js hosting provider and connect a domain to receive a public link. Set `SITE_URL` and all environment variables in the hosting dashboard. Add privacy, terms, refund, and contact pages before accepting orders.
