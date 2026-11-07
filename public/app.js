const $ = (s) => document.querySelector(s);
const SKYZONE_DISCORD = "https://discord.gg/QVR7E9jgUN";
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

async function loadConfig() {
  try {
    const cfg = await fetch("/api/config").then(r => r.json());
    ["#discordTop", "#discordHero", "#discordBottom"].forEach(sel => {
      const el = $(sel); if (el) el.href = cfg.discordInviteUrl && cfg.discordInviteUrl !== "#" ? cfg.discordInviteUrl : SKYZONE_DISCORD;
    });
  } catch {}
}
async function loadProducts() {
  const grid = $("#productGrid");
  try {
    const products = await fetch("/api/products").then(r => r.json());
    if (!products.length) { grid.innerHTML = '<div class="empty-state">The store is being updated. Check back soon.</div>'; return; }
    grid.innerHTML = products.map(p => `
      <article class="product-card">
        <div class="product-image">${p.image ? `<img src="${escapeHtml(p.image)}" alt="">` : "✦"}</div>
        <div class="product-category">${escapeHtml(p.category || "Digital")}</div>
        <h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description || "")}</p>
        <div class="product-bottom"><span class="price">${money(p.price)}</span><button class="buy-btn" data-buy="${escapeHtml(p.id)}">Buy now ↗</button></div>
      </article>`).join("");
    grid.querySelectorAll("[data-buy]").forEach(btn => btn.addEventListener("click", () => checkout(btn.dataset.buy, btn)));
  } catch { grid.innerHTML = '<div class="empty-state">Store products could not be loaded. Please try again later.</div>'; }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
async function checkout(productId, button) {
  const old = button.textContent; button.disabled = true; button.textContent = "Opening…";
  try {
    const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Checkout unavailable.");
    window.location.href = data.url;
  } catch (err) { alert(err.message); button.disabled = false; button.textContent = old; }
}
$("#menuToggle").addEventListener("click", () => $("#nav").classList.toggle("open"));
$("#nav").querySelectorAll("a").forEach(a => a.addEventListener("click", () => $("#nav").classList.remove("open")));
$("#applicationForm").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const note = $("#formNote");
  const data = new FormData(form);
  button.disabled = true;
  button.textContent = "Sending application…";
  note.textContent = "Sending your application to the Skyzone team…";
  try {
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.get("username"),
        type: data.get("type"),
        message: data.get("message")
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not send your application.");
    form.reset();
    note.textContent = "Application sent! The Skyzone team has received it in Discord.";
    button.textContent = "Application sent ✓";
  } catch (error) {
    note.textContent = error.message;
    button.textContent = "Try again ↗";
    button.disabled = false;
  }
});
$("#year").textContent = new Date().getFullYear();
loadConfig(); loadProducts();

