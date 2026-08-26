/**
 * Packrift WebMCP entry — loads on every storefront page (theme snippet), waits
 * for the browser's Web Model Context API, then registers Packrift's merchant
 * tools alongside Shopify's built-in ten. Context-aware: product pages get
 * tools bound to the product on screen; the bulk-quote page additionally
 * annotates the real form for the declarative WebMCP API.
 */
import { MerchantKit } from "../packages/merchant-kit/kit.js";
import { globalTools, productTools, setQuoteIntake } from "./tools.js";
import { mountDesk } from "./desk.js";
import { mountDeskPage } from "./deskpage.js";

const SHOPIFY_BUILTIN_TOOL_COUNT = 10;

async function init() {
  const cfg = window.__PACKRIFT_WEBMCP__ || {};
  if (cfg.quoteIntakeUrl) setQuoteIntake(cfg.quoteIntakeUrl);

  const kit = new MerchantKit({ merchant: "Packrift" });
  window.__packriftAgentDesk = kit; // debug/harness hook

  const mc = await kit.connect({ timeoutMs: 12000 });
  const forceDesk = new URLSearchParams(location.search).has("agentdesk");
  if (!mc && !forceDesk) return; // no agent-capable browser; stay invisible

  let registered = 0;
  if (mc) {
    for (const def of globalTools) if (await kit.registerTool(def)) registered++;
    registered += await kit.registerPageTools(!!cfg.product, productTools(cfg.product));
  }

  // The Agent Quote Desk: a shared human+agent worksheet. The page renders for
  // everyone; its desk tools register only in agent-capable browsers.
  if (document.getElementById("pk-desk-root")) {
    const deskTools = mountDeskPage(kit, cfg);
    if (mc) registered += await kit.registerPageTools(true, deskTools);
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
