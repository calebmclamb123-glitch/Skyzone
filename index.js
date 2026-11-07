require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

const starterProducts = [
  { id: "starter-pack", name: "Starter Digital Pack", price: 499, category: "Digital Packs", description: "A sample digital product. Replace this with your own offer.", image: "", active: true },
  { id: "premium-service", name: "Premium Service", price: 999, category: "Services", description: "A sample service listing. Add delivery details before publishing.", image: "", active: true }
];
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, starterProducts);
if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === "replace_with_a_long_random_password") {
    return res.status(503).json({ error: "Set a private ADMIN_PASSWORD in your .env file before using admin features." });
  }
  if (req.get("x-admin-password") !== expected) return res.status(401).json({ error: "Unauthorized" });
  next();
}
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/config", (req, res) => {
  res.json({ discordInviteUrl: process.env.DISCORD_INVITE_URL || "#" });
});
app.get("/api/products", (req, res) => {
  res.json(readJson(PRODUCTS_FILE, starterProducts).filter(p => p.active));
});

// Checkout intentionally remains disabled until a secure payment provider is selected.
// Never collect or store raw card numbers, CVCs, or expiry dates in this website.
app.post("/api/checkout", (req, res) => {
  res.status(503).json({ error: "Secure card checkout is not connected yet. Choose a payment provider and connect its hosted checkout." });
});

app.get("/api/admin/products", requireAdmin, (req, res) => res.json(readJson(PRODUCTS_FILE, starterProducts)));
app.put("/api/admin/products", requireAdmin, (req, res) => {
  if (!Array.isArray(req.body.products)) return res.status(400).json({ error: "Expected products array." });
  const cleaned = req.body.products.map(p => ({
    id: String(p.id || "").slice(0, 80), name: String(p.name || "").slice(0, 100),
    price: Math.max(50, Math.min(1000000, Math.round(Number(p.price) || 0))),
    category: String(p.category || "Digital").slice(0, 60),
    description: String(p.description || "").slice(0, 500),
    image: String(p.image || "").slice(0, 500), active: p.active !== false
  })).filter(p => p.id && p.name);
  writeJson(PRODUCTS_FILE, cleaned);
  res.json({ saved: true, count: cleaned.length });
});
app.get("/api/admin/orders", requireAdmin, (req, res) => res.json(readJson(ORDERS_FILE, [])));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.listen(PORT, () => console.log(`Skyzone Community Site running at http://localhost:${PORT}`));
