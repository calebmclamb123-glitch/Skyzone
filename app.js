const $ = (s) => document.querySelector(s);
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

async function loadConfig() {
  try {
    const cfg = await fetch("/api/config").then(r => r.json());
    ["#discordTop", "#discordHero", "#discordBottom"].forEach(sel => {
      const el = $(sel); if (el) el.href = cfg.discordInviteUrl || "#";
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
$("#applicationForm").addEventListener("submit", e => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  // Change this address to the community's application inbox before launch.
  const destination = "applications@example.com";
  const subject = encodeURIComponent(`${data.get("type")} — ${data.get("username")}`);
  const body = encodeURIComponent(`Name / Discord: ${data.get("username")}\nApplication type: ${data.get("type")}\n\n${data.get("message")}`);
  window.location.href = `mailto:${destination}?subject=${subject}&body=${body}`;
});
$("#year").textContent = new Date().getFullYear();
loadConfig(); loadProducts();
