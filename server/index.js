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
function publicMember(member) { return { id: member.id, username: member.username, avatar: member.avatar || "", about: member.about || "", status: member.status || "", settings: { showOnline: member.settings?.showOnline !== false, allowFriendRequests: member.settings?.allowFriendRequests !== false, allowFriendDMs: member.settings?.allowFriendDMs !== false, friendAlerts: member.settings?.friendAlerts !== false, dmAlerts: member.settings?.dmAlerts !== false } }; }
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

app.use(express.json({ limit: "5mb" }));
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
  if (username.length < 3) return res.status(400).json({ error: "Display name must be at least 3 characters." });
  if (members.some(m => m.id !== req.member.id && m.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: "That display name is already taken." });
  members[index].username = username; members[index].about = about; members[index].status = status;
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
  const avatar = cleanImageData(req.body.avatar, 400 * 1024);
  if (!avatar) return res.status(400).json({ error: "Upload a PNG, JPG, WEBP, or GIF smaller than 400 KB." });
  const members = readJson(MEMBERS_FILE, []);
  const index = members.findIndex(m => m.id === req.member.id);
  if (index < 0) return res.status(404).json({ error: "Account not found." });
  members[index].avatar = avatar; writeJson(MEMBERS_FILE, members);
  res.json({ avatar });
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
 const online=readJson(MEMBERS_FILE,[]).filter(m=>m.lastSeenAt&&Date.parse(m.lastSeenAt)>cutoff)
  .map(m=>({id:m.id,username:m.username,avatar:m.avatar||""}));
 res.json({count:online.length,members:online});
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
  { id: "media", name: "media", topic: "Share images and GIFs", category: "TEXT CHANNELS" }
];
app.get("/api/channels", requireMember, (req, res) => res.json(COMMUNITY_CHANNELS));
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
  const attachment = cleanImageData(req.body.attachment, 700 * 1024);
  if (!body && !attachment) return res.status(400).json({ error: "Write a message or attach an image/GIF." });
  if (req.body.attachment && !attachment) return res.status(400).json({ error: "Images and GIFs must be PNG, JPG, WEBP, or GIF and smaller than 700 KB." });
  if (channelId === "announcements") return res.status(403).json({ error: "Only community staff can post announcements. Use #general or #media." });
  const message = { id: crypto.randomUUID(), channelId, memberId: req.member.id, name: req.member.username, avatar: req.member.avatar || "", body, attachment: attachment || "", reactions: {}, replyTo: String(req.body.replyTo || "").slice(0, 80), editedAt: "", createdAt: new Date().toISOString() };
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
app.get("/api/admin/uploads", requireAdmin, (req, res) => res.json(readJson(UPLOADS_FILE, [])));
app.post("/api/admin/uploads", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  const data = String(req.body.data || "");
  const match = data.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!name || !match) return res.status(400).json({ error: "Choose a file and give it a name." });
  const type = match[1].toLowerCase();
  const allowed = ["image/png","image/jpeg","image/webp","image/gif","application/pdf","text/plain"];
  const bytes = Buffer.from(match[2], "base64");
  if (!allowed.includes(type) || !bytes.length || bytes.length > 2 * 1024 * 1024) return res.status(400).json({ error: "Allowed: PNG, JPG, WEBP, GIF, PDF, or TXT up to 2 MB." });
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

// Checkout intentionally stays disabled until a secure hosted payment provider is connected.
app.post("/api/checkout", (req, res) => {
  res.status(503).json({ error: "Secure card checkout is not connected yet. Choose a payment provider and connect its hosted checkout." });
});
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.listen(PORT, () => console.log("Skyzone Community Site running on port " + PORT));
