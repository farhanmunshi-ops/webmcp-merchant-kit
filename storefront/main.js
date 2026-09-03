/**
 * Packrift WebMCP entry — loads on every storefront page (theme snippet), waits
 * for the browser's Web Model Context API, then registers Packrift's merchant
 * tools alongside Shopify's built-in ten. Context-aware: product pages get
 * tools bound to the product on screen; the bulk-quote page additionally
 * annotates the real form for the declarative WebMCP API.
 */
import { MerchantKit } from "../packages/merchant-kit/kit.js";
import { loadRecipes } from "../packages/merchant-kit/recipes.js";
import { globalTools, productTools, setQuoteIntake } from "./tools.js";
import { mountDesk } from "./desk.js";
import { mountDeskPage } from "./deskpage.js";
import { installPolyfill } from "./polyfill-inline.js";

const SHOPIFY_BUILTIN_TOOL_COUNT = 10;

async function init() {
  const cfg = window.__PACKRIFT_WEBMCP__ || {};
  if (cfg.quoteIntakeUrl) setQuoteIntake(cfg.quoteIntakeUrl);

  // ?demo=1 — try-it-anywhere mode: no agent browser or flag needed.
  const demoMode = new URLSearchParams(location.search).has("demo");
  if (demoMode) installPolyfill();

  const kit = new MerchantKit({ merchant: "Packrift" });
  window.__packriftAgentDesk = kit; // debug/harness hook

  // The Agent Quote Desk page renders for EVERYONE — it's a fully usable manual
  // worksheet without an agent. Mount it before the agent-capability gate.
  const deskRoot = document.getElementById("pk-desk-root");
  const deskTools = deskRoot ? mountDeskPage(kit, cfg) : [];

  const mc = await kit.connect({ timeoutMs: 12000 });
  const forceDesk = new URLSearchParams(location.search).has("agentdesk");
  if (!mc && !forceDesk) return; // no agent-capable browser; tools + panel stay inert

  let registered = 0;
  if (mc) {
    for (const def of globalTools) if (await kit.registerTool(def)) registered++;
    registered += await kit.registerPageTools(!!cfg.product, productTools(cfg.product));
    registered += await kit.registerPageTools(deskTools.length > 0, deskTools);

    // Declarative tools from the merchant's webmcp.json manifest — no JS needed.
    if (cfg.manifestUrl) {
      try {
        const recipeDefs = await loadRecipes(cfg.manifestUrl, {
          pageType: cfg.product ? "product" : "default",
          pathname: location.pathname,
        });
        for (const def of recipeDefs) if (await kit.registerTool(def)) registered++;
      } catch (err) {
        if (cfg.debug) console.warn("[packrift-webmcp] webmcp.json skipped:", err.message);
      }
    }
  }

  // Declarative API enhancement on the bulk-quote page's real form.
  if (/\/pages\/bulk-quote/.test(location.pathname)) {
    const form = document.querySelector('form[action*="contact"]');
    kit.annotateForm(form, {
      toolname: "submit_bulk_quote_form",
      tooldescription:
        "Submit Packrift's bulk quote form. A human verifies the match and locks exact freight before a pay-ready invoice is emailed. Fill email and the item list; never auto-submit without buyer consent.",
      params: {
        "contact[email]": "Buyer's email address for the quote",
        "contact[body]": "Items requested: SKUs or specs with quantities, one per line",
      },
    });
  }

  // Anonymous aggregate telemetry (tool name + page type only — no PII, no IDs).
  if (mc && cfg.telemetryUrl) {
    const page = cfg.product ? "product" : location.pathname.includes("agent-desk") ? "desk" : "default";
    kit.on("call", ({ tool }) => {
      fetch(cfg.telemetryUrl + "/event", {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, page }),
      }).catch(() => {});
    });
  }

  mountDesk(kit, { platformTools: mc ? SHOPIFY_BUILTIN_TOOL_COUNT : 0 });

  if (cfg.debug || forceDesk) {
    console.info(
      `[packrift-webmcp] ${registered} merchant tools registered` +
        (mc ? " alongside Shopify's built-ins." : " (no model context found — desk preview only).")
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
