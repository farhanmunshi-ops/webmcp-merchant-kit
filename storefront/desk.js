/**
 * Agent Desk — the visible half of the human+agent workspace.
 *
 * When an agent-capable browser is on the page, a small desk panel appears and
 * mirrors every tool call live: the human sees what their agent is doing on the
 * store, in plain language, as it happens. This is deliberate product design for
 * WebMCP's trust model — the agent acts in the user's own tab, so the page
 * should show its work.
 */

const CSS = `
#pk-agent-desk{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:290px;
  font-family:Inter,-apple-system,system-ui,sans-serif;background:#fff;color:#1a1a1a;
  border:1px solid #e5e0da;border-radius:12px;box-shadow:0 8px 28px rgba(20,15,10,.16);
  overflow:hidden;font-size:13px;line-height:1.45}
#pk-agent-desk header{display:flex;align-items:center;gap:8px;padding:10px 14px;
  background:#1a1a1a;color:#fff;cursor:pointer}
#pk-agent-desk header .pk-dot{width:8px;height:8px;border-radius:50%;background:#e86100;
  box-shadow:0 0 0 3px rgba(232,97,0,.25);flex:none}
#pk-agent-desk header strong{font-weight:700;font-size:13px}
#pk-agent-desk header span{margin-left:auto;font-weight:500;font-size:11px;opacity:.75}
#pk-agent-desk .pk-body{max-height:260px;overflow-y:auto;padding:8px 12px}
#pk-agent-desk .pk-row{padding:7px 0;border-bottom:1px solid #f1ece6}
#pk-agent-desk .pk-row:last-child{border-bottom:none}
#pk-agent-desk .pk-tool{font-weight:700;color:#e86100}
#pk-agent-desk .pk-meta{color:#6f675e;font-size:11px}
#pk-agent-desk .pk-note{padding:8px 12px;background:#faf7f3;color:#6f675e;font-size:11px;
  border-top:1px solid #f1ece6}
#pk-agent-desk.pk-min .pk-body,#pk-agent-desk.pk-min .pk-note{display:none}
@media (prefers-color-scheme: dark){
  #pk-agent-desk{background:#211d19;color:#f2ede7;border-color:#3a342d}
  #pk-agent-desk .pk-row{border-color:#322c26}
  #pk-agent-desk .pk-note{background:#2a251f;color:#a89e92;border-color:#322c26}
  #pk-agent-desk .pk-meta{color:#a89e92}}
`;

export function mountDesk(kit, { toolTotal = 0, platformTools = 0 } = {}) {
  if (document.getElementById("pk-agent-desk")) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement("aside");
  el.id = "pk-agent-desk";
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <header title="Click to collapse">
      <span class="pk-dot"></span>
      <strong>Agent Desk</strong>
      <span id="pk-desk-count"></span>
    </header>
    <div class="pk-body" id="pk-desk-log">
      <div class="pk-row pk-meta">Your AI agent can work this store directly — spec matching,
      fit checks, live freight, supplier quote beats. Actions appear here as they happen.</div>
    </div>
    <div class="pk-note">Carts &amp; checkout stay in your control. Bulk quotes are verified by a
    human before anything is sent.${location.pathname.includes("agent-desk") ? "" :
    ' <a href="/pages/agent-desk" style="color:inherit;font-weight:700">Open the Agent Quote Desk →</a>'}</div>`;
  document.body.appendChild(el);
  el.querySelector("header").addEventListener("click", () => el.classList.toggle("pk-min"));

  const count = el.querySelector("#pk-desk-count");
  const log = el.querySelector("#pk-desk-log");
  const refreshCount = () => {
    const mine = kit.registered.size;
    count.textContent = `${mine + platformTools || toolTotal} tools live`;
  };
  refreshCount();

  const row = (html, cls = "") => {
    const div = document.createElement("div");
    div.className = `pk-row ${cls}`;
    div.innerHTML = html;
    log.prepend(div);
    while (log.children.length > 12) log.lastChild.remove();
  };

  kit.on("register", () => refreshCount());
  kit.on("call", ({ tool }) =>
    row(`<span class="pk-tool">${tool}</span> <span class="pk-meta">running…</span>`));
  kit.on("result", ({ tool, ms }) =>
    row(`<span class="pk-tool">${tool}</span> <span class="pk-meta">done in ${(ms / 1000).toFixed(1)}s</span>`));
  kit.on("error", ({ tool, error }) =>
    row(`<span class="pk-tool">${tool}</span> <span class="pk-meta">⚠ ${String(error).slice(0, 80)}</span>`));
}
