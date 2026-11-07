# Skyzone Community Website

Node/Express website for the Skyzone community, with Discord links, announcements, public website chat, store listings, staff, rules, applications, and a Google-authenticated owner dashboard.

## Owner sign-in setup

The admin page is `/admin.html`. Owner access is granted only after Google verifies the signed-in account and the email is in `ADMIN_EMAILS` (defaults to the two Skyzone owner Gmail addresses).

1. Create a Google OAuth 2.0 **Web application** client in Google Cloud Console.
2. Add the exact website origin (for example `https://skyzone-elly.onrender.com`) to **Authorized JavaScript origins**.
3. Copy the OAuth Client ID.
4. In Render > Skyzone > Environment, add:
   - `GOOGLE_CLIENT_ID`: the Google OAuth Web client ID.
   - `SESSION_SECRET`: a random private string at least 32 characters long.
   - `ADMIN_EMAILS`: `calebmclamb123@gmail.com,calebmclamb19@gmail.com` (already the server default).
5. Save and redeploy. Open `/admin.html`, choose the correct Google account, and Google will grant owner access only to the two allowlisted verified addresses.

Do not put OAuth client secrets or session secrets in GitHub or public chat. This implementation uses Google Identity Services ID-token verification; it does not ask for or store Google passwords.

## Website chat

Visitors can post using a display name without sharing an email address. Messages are public, text-only, limited in length, and rate-limited. Owners can remove messages in the admin dashboard. The current implementation stores chat, products, and announcements in local JSON files under `server/data`. Render's free filesystem can be ephemeral; connect a persistent database before relying on chat history or admin content.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and configure Google Client ID and SESSION_SECRET.
4. Run `npm start` and visit `http://localhost:3000`.

## Payments

Secure card checkout is not connected yet. Before accepting payments, connect a reputable provider's hosted checkout. Never collect or store raw card numbers, CVCs, or expiry dates on this site.

## Discord

Official Skyzone invite: `https://discord.gg/QVR7E9jgUN`.
