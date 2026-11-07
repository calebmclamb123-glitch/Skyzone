require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, "announcements.json");
const CHAT_FILE = path.join(DATA_DIR, "chat.json");
const MEMBERS_FILE = path.join(DATA_DIR, "members.json");
const UPLOADS_FILE = path.join(DATA_DIR, "uploads.json");
const FRIENDS_FILE = path.join(DATA_DIR, "friends.json");
const DMS_FILE = path.join(DATA_DIR, "direct-messages.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
const SESSION_SECRET_FILE = path.join(DATA_DIR, ".session-secret");
if (!process.env.SESSION_SECRET) {
  try { process.env.SESSION_SECRET = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim(); }
  catch {
    process.env.SESSION_SECRET = crypto.randomBytes(48).toString("hex");
    try { fs.writeFileSync(SESSION_SECRET_FILE, process.env.SESSION_SECRET, { mode: 0o600 }); } catch {}
  }
}

const starterProducts = [
  { id: "starter-pack", name: "Starter Digital Pack", price: 499, category: "Digital Packs", description: "A sample digital product. Replace this with your own offer.", image: "", active: true },
  { id: "premium-service", name: "Premium Service", price: 999, category: "Services", description: "A sample service listing. Add delivery details before publishing.", image: "", active: true }
];
const starterAnnouncements = [
  { id: "welcome", title: "Welcome to Skyzone", body: "Our community hub is here. Join the Discord to chat with members, get announcements, and stay up to date.", createdAt: new Date().toISOString(), active: true },
  { id: "discord", title: "Join our Discord", body: "For the latest updates and real-time community chat, head to our official Discord server.", createdAt: new Date().toISOString(), active: true }
];
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, starterProducts);
if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);
if (!fs.existsSync(ANNOUNCEMENTS_FILE)) writeJson(ANNOUNCEMENTS_FILE, starterAnnouncements);
if (!fs.existsSync(CHAT_FILE)) writeJson(CHAT_FILE, []);
if (!fs.existsSync(MEMBERS_FILE)) writeJson(MEMBERS_FILE, []);
if (!fs.existsSync(UPLOADS_FILE)) writeJson(UPLOADS_FILE, []);
if (!fs.existsSync(FRIENDS_FILE)) writeJson(FRIENDS_FILE, []);
if (!fs.existsSync(DMS_FILE)) writeJson(DMS_FILE, []);

const allowedEmails = (process.env.ADMIN_EMAILS || "calebmclamb123@gmail.com,calebmclamb19@gmail.com")
  .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
const cookieName = "skyzone_admin";
const memberCookieName = "skyzone_member";
const sessionLifetime = 8 * 60 * 60 * 1000;
const memberSessionLifetime = 30 * 24 * 60 * 60 * 1000;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const loginAttempts = new Map();
const chatAttempts = new Map();
const memberAttempts = new Map();

function secretReady() {
  return Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
}
function sign(value) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("base64url");
}
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}
function createSession(email, auth = "google") {
  const payload = Buffer.from(JSON.stringify({ email, auth, exp: Date.now() + sessionLifetime })).toString("base64url");
  return payload + "." + sign(payload);
}
function verifySession(req) {
  if (!secretReady()) return null;
  const parts = readCookie(req, cookieName).split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const isApprovedGoogleOwner = data.auth === "google" && allowedEmails.includes(String(data.email || "").toLowerCase());
    const isPasswordOwner = data.auth === "password" && data.email === "owner";
    if ((!isApprovedGoogleOwner && !isPasswordOwner) || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
function requireAdmin(req, res, next) {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: "Sign in with an authorized Google owner account first." });
  req.adminEmail = session.email;
  next();
}

function safeMemberName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, member) {
  const candidate = crypto.scryptSync(password, member.salt, 64);
  const expected = Buffer.from(member.passwordHash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
function createMemberSession(member) {
  const payload = Buffer.from(JSON.stringify({ id: member.id, exp: Date.now() + memberSessionLifetime })).toString("base64url");
  return payload + "." + sign(payload);
}
function verifyMemberSession(req) {
  if (!secretReady()) return null;
  const parts = readCookie(req, memberCookieName).split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!data.id || data.exp < Date.now()) return null;
    const member = readJson(MEMBERS_FILE, []).find(m => m.id === data.id);
    return member ? publicMember(member) : null;
  } catch { return null; }
}
function publicMember(member) { return { id: member.id, username: member.username, role: allowedEmails.includes(String(member.email || "").toLowerCase()) ? "Owner" : "Member", avatar: member.avatar || "", banner: member.banner || "", about: member.about || "", status: member.status || "", connections: { xbox: member.connections?.xbox || "", xboxUrl: member.connections?.xboxUrl || "", spotifyUrl: member.connections?.spotifyUrl || "", listening: member.connections?.listening || "", tiktokUrl: member.connections?.tiktokUrl || "", youtubeUrl: member.connections?.youtubeUrl || "" }, settings: { showOnline: member.settings?.showOnline !== false, allowFriendRequests: member.settings?.allowFriendRequests !== false, allowFriendDMs: member.settings?.allowFriendDMs !== false, friendAlerts: member.settings?.friendAlerts !== false, dmAlerts: member.settings?.dmAlerts !== false } }; }
function requireMember(req, res, next) {
  const member = verifyMemberSession(req);
  if (!member) return res.status(401).json({ error: "Create an account or sign in to use Skyzone chat." });
  req.member = member;
  next();
}
function cleanImageData(value, maxBytes = 500 * 1024) {
  const data = String(value || "");
  const match = data.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxBytes) return null;
  return data;
}
function rateLimit(map, key, max, windowMs) {
  const now = Date.now();
  const recent = (map.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now); map.set(key, recent); return true;
}

app.use(express.json({ limit: "28mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/config", (req, res) => {
  res.json({
    discordInviteUrl: process.env.DISCORD_INVITE_URL || "https://discord.gg/QVR7E9jgUN",
    googleClientId: process.env.GOOGLE_CLIENT_ID || ""
  });
});

app.post("/api/members/register", (req, res) => {
  if (!secretReady()) return res.status(503).json({ error: "Member accounts are temporarily unavailable. The site owner needs to finish session setup." });
  const ip = req.ip || "unknown";
  if (!rateLimit(memberAttempts, ip, 8, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
  const username = safeMemberName(req.body.username);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 254);
  const password = String(req.body.password || "");
  if (username.length < 3) return res.status(400).json({ error: "Choose a username with at least 3 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Use a password between 10 and 128 characters." });
  const members = readJson(MEMBERS_FILE, []);
  if (members.some(m => m.email === email)) return res.status(409).json({ error: "An account with that email already exists. Try signing in." });
  if (members.some(m => m.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "That username is already taken." });
  const credentials = hashPassword(password);
  const member = { id: crypto.randomUUID(), username, email, salt: credentials.salt, passwordHash: credentials.hash, avatar: "", about: "", status: "", settings: {}, createdAt: new Date().toISOString() };
  members.push(member); writeJson(MEMBERS_FILE, members);
  res.cookie(memberCookieName, createMemberSession(member), { httpOnly: true, secure: req.secure, sameSite: "lax", maxAge: memberSessionLifetime, path: "/" });
  res.status(201).json(publicMember(member));
});
app.post("/api/members/login", (req, res) => {
  if (!secretReady()) return res.status(503).json({ error: "Member accounts are temporarily unavailable. The site owner needs to finish session setup." });
  const ip = req.ip || "unknown";
  if (!rateLimit(memberAttempts, ip, 10, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const member = readJson(MEMBERS_FILE, []).find(m => m.email === email);
  if (!member || !verifyPassword(password, member)) return res.status(401).json({ error: "Email or password is incorrect." });
  res.cookie(memberCookieName, createMemberSession(member), { httpOnly: true, secure: req.secure, sameSite: "lax", maxAge: memberSessionLifetime, path: "/" });
  res.json(publicMember(member));
});
app.get("/api/members/me", (req, res) => {
  const member = verifyMemberSession(req);
  if (!member) return res.status(401).json({ error: "Not signed in." });
  res.json({ ...publicMember(member), email: readJson(MEMBERS_FILE, []).find(m => m.id === member.id)?.email || "" });
});
app.post("/api/members/logout", (req, res) => {
  res.clearCookie(memberCookieName, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/" });
  res.json({ ok: true });
});

app.put("/api/members/profile", requireMember, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  const username = safeMemberName(req.body.username);
  const about = String(req.body.about || "").trim().slice(0, 160);
  const status = String(req.body.status || "").trim().slice(0, 32);
  const cleanLink = value => { const raw = String(value || "").trim().slice(0, 300); if (!raw) return ""; try { const url = new URL(raw); return ["https:", "http:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; } };
  const previousConnections = members[index].connections || {};
  const incomingConnections = req.body.connections && typeof req.body.connections === "object" ? req.body.connections : {};
  const connections = { xbox: String(incomingConnections.xbox ?? previousConnections.xbox ?? "").trim().slice(0, 32), xboxUrl: cleanLink(incomingConnections.xboxUrl ?? previousConnections.xboxUrl), spotifyUrl: cleanLink(incomingConnections.spotifyUrl ?? previousConnections.spotifyUrl), listening: String(incomingConnections.listening ?? previousConnections.listening ?? "").trim().slice(0, 100), tiktokUrl: cleanLink(incomingConnections.tiktokUrl ?? previousConnections.tiktokUrl), youtubeUrl: cleanLink(incomingConnections.youtubeUrl ?? previousConnections.youtubeUrl) };
  if (username.length < 3) return res.status(400).json({ error: "Display name must be at least 3 characters." });
  if (members.some(m => m.id !== req.member.id && m.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "That display name is already taken." });
  members[index].username = username; members[index].about = about; members[index].status = status; members[index].connections = connections;
  writeJson(MEMBERS_FILE, members);
  res.json(publicMember(members[index]));
});
app.put("/api/members/settings", requireMember, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  const keys = ["showOnline", "allowFriendRequests", "allowFriendDMs", "friendAlerts", "dmAlerts"];
  const current = publicMember(members[index]).settings;
  for (const key of keys) if (typeof req.body[key] === "boolean") current[key] = req.body[key];
  members[index].settings = current; writeJson(MEMBERS_FILE, members);
  res.json({ settings: current });
});

app.put("/api/members/avatar", requireMember, (req, res) => {
  const avatar = cleanImageData(req.body.avatar, 10 * 1024 * 1024);
  if (!avatar) return res.status(400).json({ error: "Upload a PNG, JPG, WEBP, or GIF up to 10 MB." });
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  members[index].avatar = avatar; writeJson(MEMBERS_FILE, members);
  res.json({ avatar });
});

app.put("/api/members/banner", requireMember, (req, res) => {
  const banner = cleanImageData(req.body.banner, 10 * 1024 * 1024);
  if (!banner) return res.status(400).json({ error: "Upload a PNG, JPG, WEBP, or GIF up to 10 MB." });
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  members[index].banner = banner; writeJson(MEMBERS_FILE, members);
  res.json({ banner });
});
app.delete("/api/members/banner", requireMember, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  members[index].banner = ""; writeJson(MEMBERS_FILE, members);
  res.json({ banner: "" });
});

app.delete("/api/members/avatar", requireMember, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  members[index].avatar = "";
  writeJson(MEMBERS_FILE, members);
  res.json({ avatar: "" });
});

// Lightweight online presence for the member sidebar.
app.post("/api/members/presence", requireMember, (req,res)=>{
 const members=readJson(MEMBERS_FILE,[]);
 const index=members.findIndex(m=>m.id===req.member.id);
 if(index<0)return res.status(404).json({error:"Account not found."});
 members[index].lastSeenAt=new Date().toISOString();writeJson(MEMBERS_FILE,members);
 res.json({ok:true});
});
app.get("/api/members/online", requireMember, (req,res)=>{
 const cutoff=Date.now()-2*60*1000;
 const online=readJson(MEMBERS_FILE,[]).filter(m=>m.settings?.showOnline!==false&&m.lastSeenAt&&Date.parse(m.lastSeenAt)>cutoff)
  .map(m=>({id:m.id,username:m.username,avatar:m.avatar||""}));
 res.json({count:online.length,members:online});
});

// Official account connections. Provider secrets stay in Render environment variables;
// user tokens are encrypted before they are written to the member data file.
function oauthRedirectUri(provider, req) {
  const envKey = provider.toUpperCase() + "_REDIRECT_URI";
  return process.env[envKey] || ((process.env.APP_BASE_URL || (req.protocol + "://" + req.get("host"))).replace(/\/$/, "") + "/api/connections/" + provider + "/callback");
}
function oauthProvider(provider, req) {
  const redirectUri = oauthRedirectUri(provider, req);
  if (provider === "spotify" && process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    return { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET, redirectUri,
      authorize: "https://accounts.spotify.com/authorize", token: "https://accounts.spotify.com/api/token",
      scopes: "user-read-private user-read-email user-read-currently-playing user-read-playback-state" };
  }
  if (provider === "youtube" && (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) && (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)) {
    return { clientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET, redirectUri,
      authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
      scopes: "openid email profile https://www.googleapis.com/auth/youtube.readonly" };
  }
  if (provider === "tiktok" && process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET) {
    return { clientId: process.env.TIKTOK_CLIENT_KEY, clientSecret: process.env.TIKTOK_CLIENT_SECRET, redirectUri,
      authorize: "https://www.tiktok.com/v2/auth/authorize/", token: "https://open.tiktokapis.com/v2/oauth/token/",
      scopes: "user.info.basic" };
  }
  return null;
}
function encryptConnectionTokens(value) {
  const key = crypto.scryptSync(process.env.SESSION_SECRET, "skyzone-connection-tokens-v1", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
}
function decryptConnectionTokens(value) {
  const key = crypto.scryptSync(process.env.SESSION_SECRET, "skyzone-connection-tokens-v1", 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8"));
}
function connectionStateCookie(provider) { return "skyzone_oauth_" + provider; }
function safeConnectionSummary(member) {
  const all = member.connectedAccounts || {};
  const result = {};
  for (const [provider, item] of Object.entries(all)) result[provider] = { provider, displayName: item.displayName || "", avatar: item.avatar || "", linkedAt: item.linkedAt || "" };
  return result;
}
app.get("/api/connections", requireMember, (req, res) => {
  const member = readJson(MEMBERS_FILE, []).find(m => m.id === req.member.id);
  res.json(safeConnectionSummary(member || {}));
});
app.get("/api/connections/:provider/start", requireMember, (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  if (!["spotify", "youtube", "tiktok"].includes(provider)) return res.status(404).send("This connection is not available yet.");
  const config = oauthProvider(provider, req);
  if (!config) return res.status(503).send("<!doctype html><meta charset=utf-8><title>Skyzone connection setup</title><main style='font:16px system-ui;max-width:620px;margin:12vh auto;padding:24px;color:#eee;background:#20232a;border-radius:14px'><h1>Connect " + provider + " to Skyzone</h1><p>This service needs its official developer app credentials before its authorization screen can open.</p><p>The site owner must add the provider Client ID and Client Secret in Render Environment, then register this exact callback URL:</p><code>" + oauthRedirectUri(provider, req) + "</code><p><a style='color:#bca8ff' href='/#account'>Return to Skyzone</a></p></main>");
  const state = crypto.randomBytes(32).toString("hex");
  const cookieValue = state + "." + sign(state + "|" + req.member.id);
  res.cookie(connectionStateCookie(provider), cookieValue, { httpOnly: true, secure: req.secure, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/" });
  const url = new URL(config.authorize);
  if (provider === "tiktok") {
    url.search = new URLSearchParams({ client_key: config.clientId, response_type: "code", scope: config.scopes, redirect_uri: config.redirectUri, state, disable_auto_auth: "1" }).toString();
  } else {
    url.search = new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: config.redirectUri, scope: config.scopes, state, ...(provider === "youtube" ? { access_type: "offline", include_granted_scopes: "true", prompt: "consent" } : { show_dialog: "true" }) }).toString();
  }
  res.redirect(url.toString());
});
app.get("/api/connections/:provider/callback", async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  if (!["spotify", "youtube", "tiktok"].includes(provider)) return res.status(404).send("Connection not found.");
  const cookieName = connectionStateCookie(provider);
  const cookie = readCookie(req, cookieName);
  res.clearCookie(cookieName, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/" });
  const parts = cookie.split(".");
  const state = String(req.query.state || "");
  if (parts.length !== 2 || !state || parts[0] !== state) return res.status(400).send("Skyzone could not verify this authorization request. Please return to Skyzone and try again.");
  const member = verifyMemberSession(req);
  if (!member || !crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(sign(state + "|" + member.id)))) return res.status(401).send("Your Skyzone session expired. Sign in again and reconnect your account.");
  if (req.query.error) return res.redirect("/#account");
  const config = oauthProvider(provider, req);
  if (!config || !req.query.code) return res.status(503).send("The connection could not be completed. Check the provider setup and try again.");
  try {
    const form = new URLSearchParams({ grant_type: "authorization_code", code: String(req.query.code), redirect_uri: config.redirectUri });
    if (provider === "tiktok") {
      form.set("client_key", config.clientId); form.set("client_secret", config.clientSecret);
    } else {
      form.set("client_id", config.clientId); form.set("client_secret", config.clientSecret);
    }
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (provider === "spotify") headers.Authorization = "Basic " + Buffer.from(config.clientId + ":" + config.clientSecret).toString("base64");
    const tokenResponse = await fetch(config.token, { method: "POST", headers, body: form, signal: AbortSignal.timeout(15000) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) throw new Error("The provider token exchange was rejected.");
    let profile = {};
    if (provider === "spotify") {
      const response = await fetch("https://api.spotify.com/v1/me", { headers: { Authorization: "Bearer " + tokens.access_token }, signal: AbortSignal.timeout(10000) });
      if (response.ok) profile = await response.json();
    } else if (provider === "youtube") {
      const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: "Bearer " + tokens.access_token }, signal: AbortSignal.timeout(10000) });
      if (response.ok) profile = await response.json();
    } else {
      const response = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", { headers: { Authorization: "Bearer " + tokens.access_token }, signal: AbortSignal.timeout(10000) });
      if (response.ok) profile = (await response.json()).data?.user || {};
    }
    const members = readJson(MEMBERS_FILE, []);
    const index = members.findIndex(m => m.id === member.id);
    if (index < 0) throw new Error("Skyzone member account was not found.");
    if (!members[index].connectedAccounts) members[index].connectedAccounts = {};
    members[index].connectedAccounts[provider] = {
      providerId: String(profile.id || profile.sub || profile.open_id || ""),
      displayName: String(profile.display_name || profile.display_name || profile.name || profile.email || profile.id || provider).slice(0, 100),
      avatar: String(profile.images?.[0]?.url || profile.avatar_url || profile.picture || "").slice(0, 1000),
      linkedAt: new Date().toISOString(),
      tokens: encryptConnectionTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token || "", expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, scope: tokens.scope || "" })
    };
    writeJson(MEMBERS_FILE, members);
    res.redirect("/#account");
  } catch (error) {
    console.error("Skyzone " + provider + " connection failed:", error.message);
    res.status(502).send("Skyzone could not finish connecting this account. Return to Skyzone and try again.");
  }
});
app.delete("/api/connections/:provider", requireMember, (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  if (members[index].connectedAccounts) delete members[index].connectedAccounts[provider];
  writeJson(MEMBERS_FILE, members);
  res.json({ connected: false });
});

app.get("/api/products", (req, res) => res.json(readJson(PRODUCTS_FILE, starterProducts).filter(p => p.active)));
app.get("/api/announcements", (req, res) => res.json(readJson(ANNOUNCEMENTS_FILE, starterAnnouncements).filter(a => a.active)));

app.post("/api/admin/password", (req, res) => {
  if (!secretReady()) return res.status(503).json({ error: "Owner sign-in is unavailable because SESSION_SECRET is missing or too short. Set it in Render." });
  const configuredPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!configuredPassword) return res.status(503).json({ error: "Set ADMIN_PASSWORD in Render Environment first." });
  const ip = req.ip || "unknown";
  if (!rateLimit(loginAttempts, ip, 8, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes." });
  const supplied = Buffer.from(String(req.body.password || ""));
  const expected = Buffer.from(configuredPassword);
  const matches = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!matches) return res.status(401).json({ error: "Owner password is incorrect." });
  res.cookie(cookieName, createSession("owner", "password"), {
    httpOnly: true, secure: req.secure, sameSite: "lax", maxAge: sessionLifetime, path: "/"
  });
  res.json({ ok: true, email: "Owner password login" });
});

app.post("/api/admin/google", async (req, res) => {
  if (!secretReady()) return res.status(503).json({ error: "Admin sign-in is not configured. Add SESSION_SECRET in Render Environment." });
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID in Render Environment." });
  const ip = req.ip || "unknown";
  if (!rateLimit(loginAttempts, ip, 10, 15 * 60 * 1000)) return res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes." });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: String(req.body.credential || ""), audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = String(payload.email || "").toLowerCase();
    if (!payload.email_verified || !allowedEmails.includes(email)) {
      return res.status(403).json({ error: "This Google account is not on the Skyzone owner list." });
    }
    res.cookie(cookieName, createSession(email), {
      httpOnly: true, secure: req.secure, sameSite: "lax", maxAge: sessionLifetime, path: "/"
    });
    res.json({ ok: true, email });
  } catch {
    res.status(401).json({ error: "Google sign-in could not be verified. Please try again." });
  }
});
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ email: req.adminEmail }));
app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/" });
  res.json({ ok: true });
});

app.get("/api/admin/products", requireAdmin, (req, res) => res.json(readJson(PRODUCTS_FILE, starterProducts)));
app.put("/api/admin/products", requireAdmin, (req, res) => {
  if (!Array.isArray(req.body.products)) return res.status(400).json({ error: "Expected products array." });
  const cleaned = req.body.products.map(p => ({
    id: String(p.id || "").slice(0, 80), name: String(p.name || "").slice(0, 100),
    price: Math.max(0, Math.min(1000000, Math.round(Number(p.price) || 0))),
    category: String(p.category || "Digital").slice(0, 60),
    description: String(p.description || "").slice(0, 500),
    image: String(p.image || "").slice(0, 500), active: p.active !== false
  })).filter(p => p.id && p.name);
  writeJson(PRODUCTS_FILE, cleaned);
  res.json({ saved: true, count: cleaned.length });
});
app.get("/api/admin/announcements", requireAdmin, (req, res) => res.json(readJson(ANNOUNCEMENTS_FILE, starterAnnouncements)));
app.put("/api/admin/announcements", requireAdmin, (req, res) => {
  if (!Array.isArray(req.body.announcements)) return res.status(400).json({ error: "Expected announcements array." });
  const cleaned = req.body.announcements.map(a => ({
    id: String(a.id || crypto.randomUUID()).slice(0, 80),
    title: String(a.title || "").slice(0, 120),
    body: String(a.body || "").slice(0, 2000),
    createdAt: a.createdAt || new Date().toISOString(),
    active: a.active !== false
  })).filter(a => a.title && a.body).slice(0, 50);
  writeJson(ANNOUNCEMENTS_FILE, cleaned);
  res.json({ saved: true, count: cleaned.length });
});
app.get("/api/admin/orders", requireAdmin, (req, res) => res.json(readJson(ORDERS_FILE, [])));
app.get("/api/admin/chat", requireAdmin, (req, res) => { const all=readJson(CHAT_FILE,[]).map(m=>({...m,channelId:m.channelId||"general"})); if(!req.query.channel)return res.json(all.slice(-200)); const channelId=String(req.query.channel); if(!COMMUNITY_CHANNELS.some(c=>c.id===channelId)) return res.status(404).json({error:"Channel not found."}); res.json(all.filter(m=>m.channelId===channelId).slice(-100)); });
app.get("/api/admin/members", requireAdmin, (req, res) => res.json(readJson(MEMBERS_FILE, []).map(m => ({ id: m.id, username: m.username, avatar: m.avatar || "", createdAt: m.createdAt || null, status: m.status || "" }))));
app.delete("/api/admin/members/:id/avatar", requireAdmin, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Member not found." });
  members[index].avatar = "";
  writeJson(MEMBERS_FILE, members);
  res.json({ removed: true });
});
app.delete("/api/admin/chat/:id", requireAdmin, (req, res) => {
  const messages = readJson(CHAT_FILE, []).filter(m => m.id !== req.params.id);
  writeJson(CHAT_FILE, messages);
  res.json({ deleted: true });
});

// Member friendships and private one-to-one messages.
function areFriends(a,b){return readJson(FRIENDS_FILE,[]).some(x=>x.status==="accepted"&&((x.from===a&&x.to===b)||(x.from===b&&x.to===a)))}
app.get("/api/friends", requireMember, (req,res)=>{
 const all=readJson(FRIENDS_FILE,[]);
 const members=readJson(MEMBERS_FILE,[]);
 const view=(x)=>{const m=members.find(v=>v.id===(x.from===req.member.id?x.to:x.from));return m?{id:m.id,username:m.username,avatar:m.avatar||""}:null};
 res.json({
  friends:all.filter(x=>x.status==="accepted"&&(x.from===req.member.id||x.to===req.member.id)).map(x=>view(x)).filter(Boolean),
  incoming:all.filter(x=>x.status==="pending"&&x.to===req.member.id).map(x=>({...view(x),requestId:x.id})).filter(Boolean),
  outgoing:all.filter(x=>x.status==="pending"&&x.from===req.member.id).map(x=>({...view(x),requestId:x.id})).filter(Boolean)
 });
});
app.post("/api/friends/requests", requireMember, (req,res)=>{
 const username=safeMemberName(req.body.username);
 const target=readJson(MEMBERS_FILE,[]).find(m=>m.username.toLowerCase()===username.toLowerCase());
 if(!target)return res.status(404).json({error:"No Skyzone member has that username."});
  if(target.settings?.allowFriendRequests===false)return res.status(403).json({error:"That member is not accepting friend requests."});
 if(target.id===req.member.id)return res.status(400).json({error:"You cannot add yourself."});
 const all=readJson(FRIENDS_FILE,[]);
 if(all.some(x=>(x.from===req.member.id&&x.to===target.id)||(x.from===target.id&&x.to===req.member.id)))return res.status(409).json({error:"A request or friendship already exists."});
 const request={id:crypto.randomUUID(),from:req.member.id,to:target.id,status:"pending",createdAt:new Date().toISOString()};
 all.push(request);writeJson(FRIENDS_FILE,all);
 res.status(201).json({sent:true,username:target.username});
});
app.post("/api/friends/requests/:id/accept", requireMember, (req,res)=>{
 const all=readJson(FRIENDS_FILE,[]),item=all.find(x=>x.id===req.params.id&&x.to===req.member.id&&x.status==="pending");
 if(!item)return res.status(404).json({error:"Friend request not found."});
 item.status="accepted";item.acceptedAt=new Date().toISOString();writeJson(FRIENDS_FILE,all);res.json({accepted:true});
});
app.delete("/api/friends/requests/:id", requireMember, (req,res)=>{
 const all=readJson(FRIENDS_FILE,[]),item=all.find(x=>x.id===req.params.id&&(x.from===req.member.id||x.to===req.member.id)&&x.status==="pending");
 if(!item)return res.status(404).json({error:"Friend request not found."});
 writeJson(FRIENDS_FILE,all.filter(x=>x.id!==item.id));res.json({removed:true});
});
app.delete("/api/friends/:id", requireMember, (req,res)=>{
 const all=readJson(FRIENDS_FILE,[]),item=all.find(x=>x.status==="accepted"&&((x.from===req.member.id&&x.to===req.params.id)||(x.to===req.member.id&&x.from===req.params.id)));
 if(!item)return res.status(404).json({error:"Friend not found."});
 writeJson(FRIENDS_FILE,all.filter(x=>x.id!==item.id));res.json({removed:true});
});
app.get("/api/dms", requireMember, (req,res)=>{
 const other=String(req.query.with||"");
 if(!other||!areFriends(req.member.id,other))return res.status(403).json({error:"You can only message accepted friends."});
 res.json(readJson(DMS_FILE,[]).filter(m=>(m.from===req.member.id&&m.to===other)||(m.from===other&&m.to===req.member.id)).slice(-100));
});
app.post("/api/dms", requireMember, (req,res)=>{
 const to=String(req.body.to||"");const body=String(req.body.body||"").trim().slice(0,1000);
 if(!areFriends(req.member.id,to))return res.status(403).json({error:"You can only message accepted friends."});
 if(!body)return res.status(400).json({error:"Write a message first."});
 if(!rateLimit(chatAttempts,req.ip||"unknown",12,60000))return res.status(429).json({error:"Please slow down before sending another message."});
 const message={id:crypto.randomUUID(),from:req.member.id,to,body,createdAt:new Date().toISOString()};
 const all=readJson(DMS_FILE,[]);all.push(message);writeJson(DMS_FILE,all.slice(-2000));res.status(201).json(message);
});

// Member community channels and message interactions.
const COMMUNITY_CHANNELS = [
  { id: "general", name: "general", topic: "Everyday community conversation", category: "TEXT CHANNELS" },
  { id: "announcements", name: "announcements", topic: "Community updates and news", category: "TEXT CHANNELS" },
  { id: "media", name: "media", topic: "Share images and GIFs", category: "TEXT CHANNELS" },
  { id: "gaming", name: "gaming", topic: "Talk games, servers, and what you are playing", category: "TEXT CHANNELS" },
  { id: "off-topic", name: "off-topic", topic: "Casual conversations beyond the main topic", category: "TEXT CHANNELS" },
  { id: "help", name: "help", topic: "Ask questions and help other members", category: "TEXT CHANNELS" }
];
app.get("/api/channels", requireMember, (req, res) => res.json(COMMUNITY_CHANNELS));
app.post("/api/admin/chat", requireAdmin, (req,res)=>{ const body=String(req.body.body||"").trim().slice(0,2000); if(!body)return res.status(400).json({error:"Write an announcement first."}); const message={id:crypto.randomUUID(),channelId:"announcements",memberId:"owner",name:"Owner",avatar:"",body,attachment:"",reactions:{},replyTo:"",editedAt:"",createdAt:new Date().toISOString()}; const messages=readJson(CHAT_FILE,[]); messages.push(message); writeJson(CHAT_FILE,messages.slice(-500)); res.status(201).json(message); });
app.get("/api/chat", requireMember, (req, res) => {
  const channelId = String(req.query.channel || "general");
  if (!COMMUNITY_CHANNELS.some(c => c.id === channelId)) return res.status(404).json({ error: "Channel not found." });
  const messages = readJson(CHAT_FILE, []).map(m => ({ ...m, channelId: m.channelId || "general" }))
    .filter(m => m.channelId === channelId).slice(-100);
  res.json(messages);
});
app.post("/api/chat", requireMember, (req, res) => {
  const ip = req.ip || "unknown";
  if (!rateLimit(chatAttempts, ip, 5, 30 * 1000)) return res.status(429).json({ error: "Please wait a moment before sending another message." });
  const body = String(req.body.body || "").trim().slice(0, 500);
  const channelId = String(req.body.channelId || "general");
  if (!COMMUNITY_CHANNELS.some(c => c.id === channelId)) return res.status(400).json({ error: "Choose a valid channel." });
  const attachment = cleanImageData(req.body.attachment, 8 * 1024 * 1024);
  if (!body && !attachment) return res.status(400).json({ error: "Write a message or attach an image/GIF." });
  if (req.body.attachment && !attachment) return res.status(400).json({ error: "Images and GIFs must be PNG, JPG, WEBP, or GIF and no larger than 8 MB." });
  if (channelId === "announcements") return res.status(403).json({ error: "Only community staff can post announcements. Use #general or #media." });
  const message = { id: crypto.randomUUID(), channelId, memberId: req.member.id, name: req.member.username, role: req.member.role || "Member", avatar: req.member.avatar || "", body, attachment: attachment || "", reactions: {}, replyTo: String(req.body.replyTo || "").slice(0, 80), editedAt: "", createdAt: new Date().toISOString() };
  const messages = readJson(CHAT_FILE, []); messages.push(message); writeJson(CHAT_FILE, messages.slice(-500));
  res.status(201).json(message);
});
app.patch("/api/chat/:id", requireMember, (req, res) => {
  const messages = readJson(CHAT_FILE, []);
  const item = messages.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Message not found." });
  if (item.memberId !== req.member.id) return res.status(403).json({ error: "You can only edit your own messages." });
  const body = String(req.body.body || "").trim().slice(0, 500);
  if (!body) return res.status(400).json({ error: "Message cannot be empty." });
  item.body = body; item.editedAt = new Date().toISOString();
  writeJson(CHAT_FILE, messages);
  res.json({ updated: true, message: item });
});
app.delete("/api/chat/:id", requireMember, (req, res) => {
  const messages = readJson(CHAT_FILE, []);
  const item = messages.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Message not found." });
  if (item.memberId !== req.member.id) return res.status(403).json({ error: "You can only delete your own messages." });
  writeJson(CHAT_FILE, messages.filter(m => m.id !== req.params.id));
  res.json({ deleted: true });
});
app.post("/api/chat/:id/reactions", requireMember, (req, res) => {
  const emoji = String(req.body.emoji || "");
  if (!["👍","❤️","😂","🎉","👀"].includes(emoji)) return res.status(400).json({ error: "Choose an available reaction." });
  const messages = readJson(CHAT_FILE, []);
  const item = messages.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Message not found." });
  item.reactions = item.reactions || {};
  item.reactions[emoji] = Array.isArray(item.reactions[emoji]) ? item.reactions[emoji] : [];
  const ids = item.reactions[emoji];
  item.reactions[emoji] = ids.includes(req.member.id) ? ids.filter(id => id !== req.member.id) : [...ids, req.member.id];
  if (!item.reactions[emoji].length) delete item.reactions[emoji];
  writeJson(CHAT_FILE, messages);
  res.json({ reactions: item.reactions });
});

app.get("/api/chat/search", requireMember, (req,res)=>{
 const channelId=String(req.query.channel||"general");
 const query=String(req.query.q||"").trim().toLowerCase().slice(0,100);
 if(!COMMUNITY_CHANNELS.some(c=>c.id===channelId))return res.status(404).json({error:"Channel not found."});
 if(query.length<2)return res.status(400).json({error:"Enter at least 2 characters to search."});
 const found=readJson(CHAT_FILE,[]).map(m=>({...m,channelId:m.channelId||"general"}))
  .filter(m=>m.channelId===channelId&&(String(m.body||"").toLowerCase().includes(query)||String(m.name||"").toLowerCase().includes(query)))
  .slice(-100);
 res.json(found);
});
app.get("/api/admin/chat/pins", requireAdmin, (req,res)=>{
 const channelId=String(req.query.channel||"general");
 res.json(readJson(CHAT_FILE,[]).filter(m=>(m.channelId||"general")===channelId&&m.pinned).slice(-50));
});
app.post("/api/admin/chat/:id/pin", requireAdmin, (req,res)=>{
 const messages=readJson(CHAT_FILE,[]);
 const item=messages.find(m=>m.id===req.params.id);
 if(!item)return res.status(404).json({error:"Message not found."});
 item.pinned=true;item.pinnedAt=new Date().toISOString();item.pinnedBy=req.adminEmail||"Owner";
 writeJson(CHAT_FILE,messages);res.json({pinned:true});
});
app.delete("/api/admin/chat/:id/pin", requireAdmin, (req,res)=>{
 const messages=readJson(CHAT_FILE,[]);
 const item=messages.find(m=>m.id===req.params.id);
 if(!item)return res.status(404).json({error:"Message not found."});
 item.pinned=false;delete item.pinnedAt;delete item.pinnedBy;
 writeJson(CHAT_FILE,messages);res.json({pinned:false});
});

app.get("/api/admin/uploads", requireAdmin, (req, res) => res.json(readJson(UPLOADS_FILE, [])));
app.post("/api/admin/uploads", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  const data = String(req.body.data || "");
  const match = data.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!name || !match) return res.status(400).json({ error: "Choose a file and give it a name." });
  const type = match[1].toLowerCase();
  const allowed = ["image/png","image/jpeg","image/webp","image/gif","application/pdf","text/plain"];
  const bytes = Buffer.from(match[2], "base64");
  if (!allowed.includes(type) || !bytes.length || bytes.length > 10 * 1024 * 1024) return res.status(400).json({ error: "Allowed: PNG, JPG, WEBP, GIF, PDF, or TXT up to 10 MB." });
  const uploads = readJson(UPLOADS_FILE, []);
  if (uploads.length >= 50) return res.status(400).json({ error: "The upload library is full (50 files maximum)." });
  const item = { id: crypto.randomUUID(), name, type, data, size: bytes.length, createdAt: new Date().toISOString() };
  uploads.unshift(item); writeJson(UPLOADS_FILE, uploads);
  res.status(201).json({ id: item.id, name: item.name, type: item.type, size: item.size, createdAt: item.createdAt });
});
app.delete("/api/admin/uploads/:id", requireAdmin, (req, res) => {
  writeJson(UPLOADS_FILE, readJson(UPLOADS_FILE, []).filter(item => item.id !== req.params.id));
  res.json({ deleted: true });
});

// Send website applications to the private Discord applications channel via a server-side webhook.
const applicationAttempts = new Map();
app.post("/api/applications", async (req, res) => {
  const ip = req.ip || "unknown";
  if (!rateLimit(applicationAttempts, ip, 3, 10 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many applications sent. Please wait a few minutes." });
  }
  const username = String(req.body.username || "").trim().slice(0, 80);
  const type = String(req.body.type || "").trim().slice(0, 60);
  const message = String(req.body.message || "").trim().slice(0, 1500);
  const allowedTypes = ["Staff application", "Partnership application", "Other"];
  if (username.length < 2 || !allowedTypes.includes(type) || message.length < 10) {
    return res.status(400).json({ error: "Please enter your name, choose an application type, and write at least 10 characters." });
  }
  const webhookUrl = process.env.DISCORD_APPLICATIONS_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({ error: "Applications are temporarily unavailable. Please contact the Skyzone team on Discord." });
  }
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.hostname !== "discord.com" || !parsed.pathname.startsWith("/api/webhooks/")) {
      return res.status(503).json({ error: "The applications destination is not configured correctly." });
    }
    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "New Skyzone Website Application",
          color: 0x8b5cf6,
          fields: [
            { name: "Applicant", value: username, inline: true },
            { name: "Application type", value: type, inline: true }
          ],
          description: message,
          timestamp: new Date().toISOString(),
          footer: { text: "Submitted through the Skyzone website" }
        }],
        allowed_mentions: { parse: [] }
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!discordResponse.ok) {
      console.error("Discord application webhook returned status", discordResponse.status);
      return res.status(502).json({ error: "Discord could not receive the application. Please try again later." });
    }
    res.status(201).json({ sent: true });
  } catch (error) {
    console.error("Application delivery failed:", error.message);
    res.status(502).json({ error: "Could not reach Discord. Please try again later." });
  }
});


/* Multi-server community foundation: isolated servers, memberships, invites,
   channel configuration and per-server message storage. */
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");
const SERVER_MESSAGES_FILE = path.join(DATA_DIR, "server-messages.json");
if (!fs.existsSync(SERVERS_FILE)) writeJson(SERVERS_FILE, []);
if (!fs.existsSync(SERVER_MESSAGES_FILE)) writeJson(SERVER_MESSAGES_FILE, []);
function cleanServerName(value) { return String(value || "").trim().replace(/\\s+/g, " ").slice(0, 48); }
function getServerMembership(server, memberId) { return (server.members || []).find(x => x.memberId === memberId); }
function publicServer(server, memberId) {
  const membership = getServerMembership(server, memberId);
  return { id: server.id, name: server.name, description: server.description || "", icon: server.icon || "", ownerId: server.ownerId, inviteCode: membership?.role === "owner" || membership?.role === "admin" ? server.inviteCode : undefined, role: membership?.role || "member", memberCount: (server.members || []).length, channels: (server.channels || []).map(c => ({ id: c.id, name: c.name, topic: c.topic || "", type: c.type || "text" })) };
}
function requireServerMember(req, res, next) {
  const server = readJson(SERVERS_FILE, []).find(s => s.id === req.params.serverId);
  if (!server || !getServerMembership(server, req.member.id)) return res.status(404).json({ error: "Server not found or you are not a member." });
  req.server = server; next();
}
function requireServerManager(req, res, next) {
  const membership = getServerMembership(req.server, req.member.id);
  if (!membership || !["owner", "admin"].includes(membership.role)) return res.status(403).json({ error: "Only this server's owner or an administrator can do that." });
  next();
}
app.get("/api/servers", requireMember, (req, res) => {
  const servers = readJson(SERVERS_FILE, []);
  const mine = servers.filter(s => getServerMembership(s, req.member.id));
  res.json(mine.map(s => publicServer(s, req.member.id)));
});
app.post("/api/servers", requireMember, (req, res) => {
  const name = cleanServerName(req.body.name);
  if (name.length < 2) return res.status(400).json({ error: "Server names need at least 2 characters." });
  const servers = readJson(SERVERS_FILE, []);
  if (servers.filter(s => s.ownerId === req.member.id).length >= 10) return res.status(400).json({ error: "You can own up to 10 servers." });
  const server = { id: crypto.randomUUID(), name, description: String(req.body.description || "").trim().slice(0, 240), ownerId: req.member.id, inviteCode: crypto.randomBytes(6).toString("base64url"), createdAt: new Date().toISOString(), members: [{ memberId: req.member.id, role: "owner", joinedAt: new Date().toISOString() }], channels: [{ id: crypto.randomUUID(), name: "general", topic: "Start the conversation", type: "text", category: "TEXT CHANNELS" }, { id: crypto.randomUUID(), name: "announcements", topic: "Server updates", type: "announcement", category: "TEXT CHANNELS" }] };
  servers.push(server); writeJson(SERVERS_FILE, servers);
  res.status(201).json(publicServer(server, req.member.id));
});
app.post("/api/servers/join", requireMember, (req, res) => {
  const code = String(req.body.inviteCode || "").trim();
  const servers = readJson(SERVERS_FILE, []);
  const server = servers.find(s => s.inviteCode === code);
  if (!server) return res.status(404).json({ error: "That invite code is invalid or expired." });
  if ((server.bannedMemberIds || []).includes(req.member.id)) return res.status(403).json({ error: "You are banned from this server." });
  if (getServerMembership(server, req.member.id)) return res.json(publicServer(server, req.member.id));
  if (server.members.length >= 5000) return res.status(400).json({ error: "This server is full." });
  server.members.push({ memberId: req.member.id, role: "member", joinedAt: new Date().toISOString() });
  writeJson(SERVERS_FILE, servers); res.status(200).json(publicServer(server, req.member.id));
});
app.post("/api/servers/:serverId/leave", requireMember, requireServerMember, (req, res) => {
  if (req.server.ownerId === req.member.id) return res.status(400).json({ error: "Transfer ownership or delete this server before leaving it." });
  const servers = readJson(SERVERS_FILE, []);
  const server = servers.find(s => s.id === req.params.serverId);
  server.members = server.members.filter(m => m.memberId !== req.member.id);
  writeJson(SERVERS_FILE, servers); res.json({ left: true });
});
app.delete("/api/servers/:serverId", requireMember, requireServerMember, (req, res) => {
  if (req.server.ownerId !== req.member.id) return res.status(403).json({ error: "Only the server owner can delete this server." });
  writeJson(SERVERS_FILE, readJson(SERVERS_FILE, []).filter(s => s.id !== req.server.id));
  writeJson(SERVER_MESSAGES_FILE, readJson(SERVER_MESSAGES_FILE, []).filter(m => m.serverId !== req.server.id));
  res.json({ deleted: true });
});
app.post("/api/servers/:serverId/invite", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const servers = readJson(SERVERS_FILE, []); const server = servers.find(s => s.id === req.server.id);
  server.inviteCode = crypto.randomBytes(6).toString("base64url"); writeJson(SERVERS_FILE, servers);
  res.json({ inviteCode: server.inviteCode });
});
app.post("/api/servers/:serverId/channels", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const name = String(req.body.name || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);
  if (name.length < 2) return res.status(400).json({ error: "Channel names need at least 2 letters or numbers." });
  if (req.server.channels.some(c => c.name === name)) return res.status(409).json({ error: "That channel already exists." });
  const servers = readJson(SERVERS_FILE, []); const server = servers.find(s => s.id === req.server.id);
  const channel = { id: crypto.randomUUID(), name, topic: String(req.body.topic || "").slice(0, 120), type: req.body.type === "announcement" ? "announcement" : "text", category: String(req.body.category || "TEXT CHANNELS").trim().toUpperCase().slice(0,32) };
  server.channels.push(channel); writeJson(SERVERS_FILE, servers); res.status(201).json(channel);
});
app.post("/api/servers/:serverId/categories", requireMember, requireServerMember, requireServerManager, (req,res)=>{const name=String(req.body.name||"").trim().toUpperCase().replace(/[^A-Z0-9 _-]/g,"").slice(0,32);if(name.length<2)return res.status(400).json({error:"Category names need at least 2 characters."});if(req.server.channels.some(c=>(c.category||"TEXT CHANNELS")===name))return res.status(409).json({error:"That category already exists."});res.status(201).json({name})});
app.delete("/api/servers/:serverId/channels/:channelId", requireMember, requireServerMember, requireServerManager, (req, res) => {
  if (req.server.channels.length <= 1) return res.status(400).json({ error: "A server must keep at least one channel." });
  const servers = readJson(SERVERS_FILE, []); const server = servers.find(s => s.id === req.server.id);
  if (!server.channels.some(c => c.id === req.params.channelId)) return res.status(404).json({ error: "Channel not found." });
  server.channels = server.channels.filter(c => c.id !== req.params.channelId); writeJson(SERVERS_FILE, servers);
  writeJson(SERVER_MESSAGES_FILE, readJson(SERVER_MESSAGES_FILE, []).filter(m => !(m.serverId === server.id && m.channelId === req.params.channelId)));
  res.json({ deleted: true });
});
app.get("/api/servers/:serverId/messages", requireMember, requireServerMember, (req, res) => {
  const channelId = String(req.query.channel || "");
  if (!req.server.channels.some(c => c.id === channelId)) return res.status(404).json({ error: "Channel not found." });
  res.json(readJson(SERVER_MESSAGES_FILE, []).filter(m => m.serverId === req.server.id && m.channelId === channelId).slice(-100));
});
app.post("/api/servers/:serverId/messages", requireMember, requireServerMember, (req, res) => {
  const channelId = String(req.body.channelId || ""); const channel = req.server.channels.find(c => c.id === channelId);
  const body = String(req.body.body || "").trim().slice(0, 2000);
  if (!channel) return res.status(404).json({ error: "Channel not found." });
  if (!body) return res.status(400).json({ error: "Write a message first." });
  if (channel.type === "announcement" && !["owner", "admin", "moderator"].includes(getServerMembership(req.server, req.member.id).role)) return res.status(403).json({ error: "Only server staff can post in this channel." });
  const messages = readJson(SERVER_MESSAGES_FILE, []);
  const item = { id: crypto.randomUUID(), serverId: req.server.id, channelId, memberId: req.member.id, name: req.member.username, avatar: req.member.avatar || "", body, createdAt: new Date().toISOString() };
  messages.push(item); writeJson(SERVER_MESSAGES_FILE, messages.slice(-10000)); res.status(201).json(item);
});


/* Server member roles, moderation actions and member-submitted reports. */
const SERVER_REPORTS_FILE = path.join(DATA_DIR, "server-reports.json");
if (!fs.existsSync(SERVER_REPORTS_FILE)) writeJson(SERVER_REPORTS_FILE, []);
app.get("/api/servers/:serverId/directory", requireMember, requireServerMember, (req, res) => { const members=readJson(MEMBERS_FILE,[]); res.json(req.server.members.filter(x=>x.memberId!==req.member.id).map(x=>{const m=members.find(v=>v.id===x.memberId);return m?{id:m.id,username:m.username,role:x.role}:null}).filter(Boolean)); });
app.get("/api/servers/:serverId/members", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  res.json(req.server.members.map(entry => { const m = members.find(x => x.id === entry.memberId); return m ? { id: m.id, username: m.username, avatar: m.avatar || "", role: entry.role, joinedAt: entry.joinedAt } : null; }).filter(Boolean));
});
app.patch("/api/servers/:serverId/members/:memberId/role", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const actor = getServerMembership(req.server, req.member.id);
  if (actor.role !== "owner") return res.status(403).json({ error: "Only the server owner can change staff roles." });
  const role = String(req.body.role || "");
  if (!["admin", "moderator", "member"].includes(role)) return res.status(400).json({ error: "Choose admin, moderator, or member." });
  const servers = readJson(SERVERS_FILE, []); const server = servers.find(s => s.id === req.server.id);
  const target = server.members.find(m => m.memberId === req.params.memberId);
  if (!target || target.role === "owner") return res.status(404).json({ error: "Member not found or cannot be changed." });
  target.role = role; writeJson(SERVERS_FILE, servers); res.json({ updated: true, role });
});
app.delete("/api/servers/:serverId/members/:memberId", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const actor = getServerMembership(req.server, req.member.id);
  const target = getServerMembership(req.server, req.params.memberId);
  if (!target || target.role === "owner" || (target.role === "admin" && actor.role !== "owner")) return res.status(403).json({ error: "You cannot remove this member." });
  const servers = readJson(SERVERS_FILE, []); const server = servers.find(s => s.id === req.server.id);
  server.members = server.members.filter(m => m.memberId !== req.params.memberId);
  server.bannedMemberIds = [...new Set([...(server.bannedMemberIds || []), req.params.memberId])];
  writeJson(SERVERS_FILE, servers); res.json({ removed: true, banned: true });
});
app.post("/api/servers/:serverId/reports", requireMember, requireServerMember, (req, res) => {
  const targetId = String(req.body.memberId || "");
  const reason = String(req.body.reason || "").trim().slice(0, 500);
  if (!targetId || targetId === req.member.id || !getServerMembership(req.server, targetId)) return res.status(400).json({ error: "Choose a valid member to report." });
  if (reason.length < 5) return res.status(400).json({ error: "Please explain the concern in at least 5 characters." });
  const reports = readJson(SERVER_REPORTS_FILE, []);
  const report = { id: crypto.randomUUID(), serverId: req.server.id, reporterId: req.member.id, reportedMemberId: targetId, reason, status: "open", createdAt: new Date().toISOString() };
  reports.push(report); writeJson(SERVER_REPORTS_FILE, reports.slice(-5000)); res.status(201).json({ submitted: true });
});
app.get("/api/servers/:serverId/reports", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const members = readJson(MEMBERS_FILE, []);
  const reports = readJson(SERVER_REPORTS_FILE, []).filter(r => r.serverId === req.server.id).map(r => ({ ...r, reporter: members.find(m => m.id === r.reporterId)?.username || "Former member", reported: members.find(m => m.id === r.reportedMemberId)?.username || "Former member" }));
  res.json(reports);
});
app.patch("/api/servers/:serverId/reports/:reportId", requireMember, requireServerMember, requireServerManager, (req, res) => {
  const reports = readJson(SERVER_REPORTS_FILE, []); const report = reports.find(r => r.id === req.params.reportId && r.serverId === req.server.id);
  if (!report) return res.status(404).json({ error: "Report not found." });
  report.status = req.body.status === "resolved" ? "resolved" : "open"; report.reviewedAt = new Date().toISOString(); report.reviewedBy = req.member.id;
  writeJson(SERVER_REPORTS_FILE, reports); res.json({ updated: true, status: report.status });
});

// Checkout intentionally stays disabled until a secure hosted payment provider is connected.
app.post("/api/checkout", (req, res) => {
  res.status(503).json({ error: "Secure card checkout is not connected yet. Choose a payment provider and connect its hosted checkout." });
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.listen(PORT, () => console.log("Skyzone Community Site running on port " + PORT));
