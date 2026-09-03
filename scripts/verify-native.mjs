/**
 * Reproducible native verification: launches installed Google Chrome (>=149) with
 * the WebMCP origin-trial features enabled and inspects the REAL document.modelContext
 * on the live desk page. Run: node scripts/verify-native.mjs  (needs `npm i -D playwright`)
 */
import { chromium } from "playwright";
const FEATURES = "WebMCP,WebMCPTesting,WebModelContext,WebModelContextTesting,ModelContext,ModelContextTesting";
const url = process.argv[2] || "https://packrift.com/pages/agent-desk";
const browser = await chromium.launch({ channel: "chrome", headless: true,
  args: [`--enable-features=${FEATURES}`, `--enable-blink-features=${FEATURES}`, "--enable-experimental-web-platform-features"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(url + (url.includes("?") ? "&" : "?") + "oseid=verify" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const r = await page.evaluate(async () => {
  const mc = document.modelContext;
  if (!mc) return { native: false };
  const tools = await mc.getTools();
  const pick = (n) => tools.find((t) => t.name === n);
  const run = async (n, a) => { try { const res = await mc.executeTool(pick(n), JSON.stringify(a)); return (res.content?.[0]?.text || String(res)).slice(0, 120); } catch (e) { return "ERR " + e.message; } };
  return {
    native: !mc.__polyfill, methods: Object.getOwnPropertyNames(Object.getPrototypeOf(mc)),
    toolCount: tools.length, tools: tools.map((t) => t.name).sort(),
    shopifyAdapterLoaded: localStorage.getItem("shopify:webmcp_adapter_loaded") === "true",
    sample: { get_agent_guide: await run("get_agent_guide", {}), shopify_get_cart: await run("get_cart", {}) },
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
