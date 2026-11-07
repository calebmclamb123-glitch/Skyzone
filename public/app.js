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


const chatMessagesEl = $("#chatMessages");
const chatStatusEl = $("#chatStatus");
const chatEscape = escapeHtml;
function renderChatMessages(messages) {
  if (!chatMessagesEl) return;
  if (!messages.length) { chatMessagesEl.innerHTML = '<p class="chat-empty">No messages yet. Start the conversation!</p>'; return; }
  chatMessagesEl.innerHTML = messages.map(m => {
    const time = new Date(m.createdAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
    return '<article class="chat-message"><div class="chat-message-top"><strong>'+chatEscape(m.name)+'</strong><time>'+time+'</time></div><p>'+chatEscape(m.body)+'</p></article>';
  }).join("");
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}
async function refreshChat() {
  try { const messages = await fetch("/api/chat").then(r => {if(!r.ok) throw new Error("Chat unavailable");return r.json()}); renderChatMessages(messages); }
  catch { if(chatMessagesEl) chatMessagesEl.innerHTML = '<p class="chat-empty">Chat is temporarily unavailable.</p>'; }
}
const chatForm = $("#chatForm");
if (chatForm) {
  chatForm.addEventListener("submit", async e => {
    e.preventDefault();
    const button = chatForm.querySelector("button");
    const data = new FormData(chatForm);
    button.disabled = true;
    try {
      const response = await fetch("/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:data.get("name"),body:data.get("body")})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send message.");
      chatForm.elements.body.value = "";
      chatStatusEl.textContent = "Message sent.";
      await refreshChat();
    } catch(err) { chatStatusEl.textContent = err.message; }
    finally { button.disabled = false; }
  });
  refreshChat();
  setInterval(refreshChat, 7000);
}
