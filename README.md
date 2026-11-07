# Skyzone Community Website

Responsive Skyzone community website with Discord links, announcements, store, staff, rules, applications, and an owner admin dashboard.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `ADMIN_PASSWORD` to a private password of at least 12 characters.
5. Set `SESSION_SECRET` to a random secret of at least 32 characters.
6. Run `npm start` and visit `http://localhost:3000`.

## Owner dashboard

Open `/admin.html` on the website. Only the two owner email addresses configured in `ADMIN_EMAILS` are allowed to sign in. Both owners use the private `ADMIN_PASSWORD` configured in the hosting environment. The password is not stored in the repository. Login sessions are signed, HttpOnly cookies and expire after 8 hours; repeated failed logins are rate limited.

The dashboard can publish/remove announcements and add/remove store products. Keep the admin password and session secret private. Set both in Render's Environment settings; never paste them into GitHub or public chat.

## Store and payments

Sample products are stored in `server/data/products.json`. Secure card checkout is not connected yet. Before accepting payments, connect a reputable provider's hosted checkout and configure its eligible merchant/payout account. Never collect or store raw card numbers, CVCs, or expiry dates on this site.

## Discord

The official Skyzone invite is configured as `https://discord.gg/QVR7E9jgUN`.

## Announcements

The public page shows community announcements. Owners can manage them in `/admin.html`. Data currently uses local JSON files under `server/data`; Render's free filesystem can be ephemeral, so use a persistent database/storage before relying on it for important posts or store data.

## Applications

The application form currently prepares an email using a placeholder destination in `public/app.js`. Change it to the correct application inbox before launch.
