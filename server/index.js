require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, "announcements.json");
const CHAT_FILE = path.join(DATA_DIR, "chat.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

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

const allowedEmails = (process.env.ADMIN_EMAILS || "calebmclamb123@gmail.com,calebmclamb19@gmail.com")
  .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
const cookieName = "skyzone_admin";
const sessionLifetime = 8 * 60 * 60 * 1000;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const loginAttempts = new Map();
const chatAttempts = new Map();

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
function createSession(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + sessionLifetime })).toString("base64url");
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
    if (!data.email || !allowedEmails.includes(data.email) || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
function requireAdmin(req, res, next) {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: "Sign in with an authorized Google owner account first." });
  req.adminEmail = session.email;
  next();
}
function rateLimit(map, key, max, windowMs) {
  const now = Date.now();
  const recent = (map.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now); map.set(key, recent); return true;
}

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/config", (req, res) => {
  res.json({
    discordInviteUrl: process.env.DISCORD_INVITE_URL || "https://discord.gg/QVR7E9jgUN",
    googleClientId: process.env.GOOGLE_CLIENT_ID || ""
  });
});
app.get("/api/products", (req, res) => res.json(readJson(PRODUCTS_FILE, starterProducts).filter(p => p.active)));
app.get("/api/announcements", (req, res) => res.json(readJson(ANNOUNCEMENTS_FILE, starterAnnouncements).filter(a => a.active)));

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
app.delete("/api/admin/chat/:id", requireAdmin, (req, res) => {
  const messages = readJson(CHAT_FILE, []).filter(m => m.id !== req.params.id);
  writeJson(CHAT_FILE, messages);
  res.json({ deleted: true });
});

// Public website chat. Messages are text-only and limited to reduce spam.
app.get("/api/chat", (req, res) => {
  const messages = readJson(CHAT_FILE, []).slice(-100);
  res.json(messages);
});
app.post("/api/chat", (req, res) => {
  const ip = req.ip || "unknown";
  if (!rateLimit(chatAttempts, ip, 5, 30 * 1000)) return res.status(429).json({ error: "Please wait a moment before sending another message." });
  const name = String(req.body.name || "").trim().replace(/\s+/g, " ").slice(0, 24);
  const body = String(req.body.body || "").trim().slice(0, 500);
  if (!name || !body) return res.status(400).json({ error: "Enter a display name and message." });
  const messages = readJson(CHAT_FILE, []);
  const message = { id: crypto.randomUUID(), name, body, createdAt: new Date().toISOString() };
  messages.push(message);
  writeJson(CHAT_FILE, messages.slice(-500));
  res.status(201).json(message);
});

// Checkout intentionally stays disabled until a secure hosted payment provider is connected.
app.post("/api/checkout", (req, res) => {
  res.status(503).json({ error: "Secure card checkout is not connected yet. Choose a payment provider and connect its hosted checkout." });
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.listen(PORT, () => console.log("Skyzone Community Site running on port " + PORT));
