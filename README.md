# Skyzone Community Website

Node/Express website for the Skyzone community, with website-wide member accounts, member chat channels, reactions, replies, friend requests, direct messages, online presence, store listings, announcements, staff, rules, applications, and a Google-authenticated owner dashboard.

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

## Member accounts and community

Members create one Skyzone account from the website Account section and use the same session for chat. Passwords are stored as scrypt hashes. Members can upload PNG, JPG, WEBP, or GIF avatars, send image/GIF chat attachments, use the general and media channels, read the announcements channel, reply to messages, react, and edit or delete their own messages.

The Friends & DMs panel supports username-based friend requests, accepting or ignoring incoming requests, removing friends, and one-to-one messages between accepted friends. A lightweight presence heartbeat shows recently active members. Direct messages are access-controlled to accepted friends, but are not end-to-end encrypted.

## Data persistence on Render

The app stores its JSON data under `server/data` by default. Render's filesystem can be ephemeral, so **do not rely on the default location for production accounts or chat history**.

For a Render persistent disk:
1. Open the Skyzone service in Render and add a persistent disk.
2. Choose a mount path such as `/var/data`.
3. In the service's Environment settings, add `DATA_DIR` with the value `/var/data`.
4. Set `SESSION_SECRET` to a private random value at least 32 characters long. Keep it out of GitHub.
5. Save and redeploy. Keep the disk mounted at the same path on future deploys.

This makes the existing JSON storage use the persistent disk; it is a practical interim step, not a substitute for a database when the community grows. Uploaded images are currently stored as data URLs in JSON, so a database plus object storage is the better long-term design.

## Run locally

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and configure Google Client ID and SESSION_SECRET.
4. Run `npm start` and visit `http://localhost:3000`.

## Payments

Secure card checkout is not connected yet. Before accepting payments, connect a reputable provider's hosted checkout. Never collect or store raw card numbers, CVCs, or expiry dates on this site.

## Discord

Official Skyzone invite: `https://discord.gg/QVR7E9jgUN`.


## Member accounts and chat media

Visitors can create a free account with a username, email, and password, then sign in to chat. Passwords are stored as scrypt hashes, not plain text. Members can upload a PNG, JPG, WEBP, or GIF profile picture (400 KB maximum), and attach images/GIFs to chat messages (700 KB maximum). The owner dashboard includes a protected file library for PNG, JPG, WEBP, GIF, PDF, and TXT uploads up to 2 MB.

The session signing key is generated automatically and stored in the app data directory when `SESSION_SECRET` is not supplied. For a production launch, configure a persistent `SESSION_SECRET` in Render and move member records, chat history, and uploads to persistent database/object storage. **Render's free service filesystem is ephemeral**, so locally stored accounts, profile pictures, chat attachments, and owner uploads can be lost when the service is redeployed or its instance is replaced. Do not treat the current local-JSON storage as permanent user-account storage.
