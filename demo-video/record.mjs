/**
 * Records demo scenes headlessly at 1080p: real packrift.com, real tools,
 * scripted agent. Chat overlay sits in the empty page margin (1920px viewport,
 * ~1100px centered content), an animated cursor adds life, and s0 is a cold
 * open on the payoff. Zoom directives per scene are applied later in assemble.
 */
import { chromium } from "playwright";
import { mkdirSync, renameSync, readdirSync } from "node:fs";

const OUT = new URL("./scenes/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const POLYFILL = `(function(){
  const tools=new Map(),listeners=new Set();
  const fire=()=>{listeners.forEach(fn=>{try{fn(new Event('toolchange'))}catch(e){}})};
  const mc={__polyfill:true,
    async registerTool(def,opts={}){if(tools.has(def.name))throw new Error('dup');tools.set(def.name,def);
      if(opts.signal)opts.signal.addEventListener('abort',()=>{tools.delete(def.name);fire()},{once:true});fire()},
    async getTools(){return[...tools.values()].map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations}))},
    async executeTool(name,args,opts={}){const def=tools.get(name);if(!def)throw new Error('no tool '+name);
      return def.execute(typeof args==='string'?JSON.parse(args||'{}'):(args||{}),{signal:opts.signal})},
    addEventListener(t,f){if(t==='toolchange')listeners.add(f)},removeEventListener(t,f){listeners.delete(f)}};
  Object.defineProperty(document,'modelContext',{value:mc,configurable:true});
  try{Object.defineProperty(navigator,'modelContext',{value:mc,configurable:true})}catch(e){}
})();`;

const OVERLAYS = `(function(){
  window.__demoChat = function(){
    if (document.getElementById('demo-chat')) return;
    const s=document.createElement('style');
    s.textContent='#pk-agent-desk{right:72px!important;bottom:72px!important}#demo-chat{position:fixed;left:64px;bottom:64px;z-index:2147483100;width:350px;'+
      'font-family:Inter,-apple-system,system-ui,sans-serif;background:rgba(20,17,14,.96);color:#f2ede7;'+
      'border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.4);padding:16px 18px;font-size:15.5px;line-height:1.5}'+
      '#demo-chat .h{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a89e92;margin-bottom:9px;font-weight:700}'+
      '#demo-chat .u{background:#e86100;color:#fff;border-radius:11px;padding:9px 13px;margin:7px 0;font-weight:600}'+
      '#demo-chat .a{background:#322c26;border-radius:11px;padding:9px 13px;margin:7px 0;white-space:pre-wrap}'+
      '#demo-cursor{position:fixed;z-index:2147483200;width:22px;height:22px;border-radius:50%;'+
      'background:rgba(232,97,0,.92);box-shadow:0 0 0 5px rgba(232,97,0,.28);pointer-events:none;'+
      'transition:left .55s cubic-bezier(.4,0,.2,1),top .55s cubic-bezier(.4,0,.2,1);left:-60px;top:40%}'+
      '#demo-cursor.click{animation:demoClick .35s ease-out}'+
      '@keyframes demoClick{0%{transform:scale(1)}40%{transform:scale(.6)}100%{transform:scale(1)}}'+
      '#pk-rows tr{animation:pkRowIn .55s cubic-bezier(.2,.8,.2,1) both}'+
      '@keyframes pkRowIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}'+
      '.pk-pop{animation:pkPop .7s cubic-bezier(.2,.9,.3,1.4)}'+
      '@keyframes pkPop{0%{transform:scale(.6);opacity:.2}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}'+
      '.pk-totals div span{display:inline-block}';
    document.head.appendChild(s);
    const d=document.createElement('div');d.id='demo-chat';
    d.innerHTML='<div class="h">Your agent</div><div id="demo-chat-log"></div>';
    document.body.appendChild(d);
    const c=document.createElement('div');c.id='demo-cursor';document.body.appendChild(c);
    const pop=(el)=>{el.classList.remove('pk-pop');void el.offsetWidth;el.classList.add('pk-pop');};
    for (const id of ['pk-t-supplier','pk-t-sub','pk-t-freight','pk-t-save','pk-plan']) {
      const el=document.getElementById(id); if(!el) continue;
      new MutationObserver(()=>pop(el)).observe(el,{childList:true,characterData:true,subtree:true});
    }
  };
  window.__demoSay = async function(cls, text, cps){
    window.__demoChat();
    const log=document.getElementById('demo-chat-log');
    const b=document.createElement('div');b.className=cls;log.appendChild(b);
    while(log.children.length>3) log.firstChild.remove();
    for(let i=1;i<=text.length;i++){b.textContent=text.slice(0,i);await new Promise(r=>setTimeout(r,cps||13));}
  };
  window.__demoPoint = async function(sel, click){
    window.__demoChat();
    const el=document.querySelector(sel); if(!el) return;
    const r=el.getBoundingClientRect();
    const c=document.getElementById('demo-cursor');
    c.style.left=(r.left+Math.min(r.width-20,60))+'px'; c.style.top=(r.top+r.height/2-11)+'px';
    await new Promise(r2=>setTimeout(r2,620));
    if(click){c.classList.remove('click');void c.offsetWidth;c.classList.add('click');}
  };
})();`;

const W = 1920, H = 1080;

async function scene(name, url, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  await ctx.addInitScript(POLYFILL);
  await ctx.addInitScript(OVERLAYS);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  try { await fn(page); } catch (e) { console.error(`scene ${name} error:`, e.message); }
  await page.waitForTimeout(1200);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), OUT + name + ".webm");
  await browser.close();
  console.log("recorded", name);
}

const exec = (page, tool, args) =>
  page.evaluate(([t, a]) => document.modelContext.executeTool(t, JSON.stringify(a)), [tool, args]);
const say = (page, cls, text, cps) => page.evaluate(([c, t, s]) => window.__demoSay(c, t, s), [cls, text, cps || 13]);
const point = (page, sel, click) => page.evaluate(([s, c]) => window.__demoPoint(s, c), [sel, !!click]);

const ROW1 = { row_id: "line1", supplier_line: "S-4344 12x12x12 200# boxes — 250 @ $1.42", quantity: 250,
  packrift_sku: "121212", packrift_title: "12x12x12 ECT-32 Kraft Cube Boxes 25-Pack",
  packrift_url: "https://packrift.com/products/12x12x12-ect-32-kraft-corrugated-cube-boxes-25-pack-bundle",
  packrift_line_total: 312.10, supplier_line_total: 355.00, confidence: "high" };
const ROW2 = { row_id: "line2", supplier_line: "6x9 poly bags 2 mil — 1,000 @ $0.046", quantity: 1000,
  packrift_sku: "6x9-2mil-white-1000", packrift_title: "6x9 2 Mil White Flat Poly Bags 1000/Case",
  packrift_url: "https://packrift.com/products/6x9-2-mil-white-flat-poly-bags-bulk-case-of-1000",
  packrift_line_total: 40.13, supplier_line_total: 46.00, confidence: "high" };
const PASTE = "S-4344 12x12x12 200# boxes — 250 @ $1.42 = $355.00\n6x9 poly bags 2 mil — 1,000 @ $0.046 = $46.00\nTotal: $401.00";
const TOTALS = { supplier_total: 401.00, packrift_subtotal: 352.23, savings_usd: 48.77, savings_pct: 12.2 };
/** Pre-warm + cache the live freight rate in Node (no recording running) so the cold open stays punchy. */
let FREIGHT_CACHE = null;
async function prewarmFreight() {
  try {
    const res = await fetch("https://mcp.packrift.com/mcp", { method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_shipping_estimate", arguments: {
        destination_postal_code: "75201", country: "US",
        items: [{ variant_id: "53472838484336", quantity: 10 }, { variant_id: "53473138147696", quantity: 1 }] } } }) });
    let body = await res.text();
    if (body.startsWith("event:") || body.startsWith("data:")) for (const l of body.split("\n")) if (l.startsWith("data:")) { body = l.slice(5); break; }
    const text = (JSON.parse(body).result?.content || []).map((c) => c.text).join("");
    const m = text.match(/"price":\s*"?(\d+(?:\.\d+)?)/);
    FREIGHT_CACHE = m ? { status: "estimated", amount_usd: +(+m[1]).toFixed(2), note: "live rate to 75201" } : { status: "needs_quote" };
  } catch { FREIGHT_CACHE = { status: "needs_quote" }; }
  console.log("freight prewarmed:", JSON.stringify(FREIGHT_CACHE));
}
/** Live freight for the two real items (visible call in s3); s0/s4 use the pre-warmed cache. */
async function liveFreight(page, { cached = false } = {}) {
  if (cached && FREIGHT_CACHE) return FREIGHT_CACHE;
  try {
    const res = await exec(page, "estimate_shipping_cost", { destination_postal_code: "75201", country: "US",
      items: [{ variant_id: "53472838484336", quantity: 10 }, { variant_id: "53473138147696", quantity: 1 }] });
    const text = res.content.map((c) => c.text).join("");
    const m = text.match(/"price":\s*"?(\d+(?:\.\d+)?)/);
    return m ? { status: "estimated", amount_usd: +(+m[1]).toFixed(2), note: "live rate to 75201" } : { status: "needs_quote" };
  } catch { return { status: "needs_quote" }; }
}

const TITLE = (h, sub, foot) => "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html>
<style>body{margin:0;background:#14110e;color:#f2ede7;font-family:Inter,-apple-system,system-ui,sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh}
.w{max-width:1240px;padding:0 80px;text-align:center;animation:in 1.1s ease-out}
h1{font-size:72px;line-height:1.12;margin:0 0 26px;font-weight:800}
h1 em{color:#e86100;font-style:normal}
p{font-size:29px;color:#a89e92;margin:0 0 12px;line-height:1.5}
.f{margin-top:36px;font-size:20px;color:#6f675e}
@keyframes in{from{opacity:0;transform:translateY(16px)}to{opacity:1}}
</style><div class="w"><h1>${h}</h1><p>${sub}</p><div class="f">${foot}</div></div>`);

await prewarmFreight();

/* S0 — cold open: the payoff first */
await scene("s0_cold", "https://packrift.com/pages/agent-desk?oseid=vidc", async (page) => {
  await page.fill("#pk-paste", PASTE);
  await page.fill("#pk-zip", "75201");
  await exec(page, "upsert_comparison_row", ROW1);
  await exec(page, "upsert_comparison_row", ROW2);
  await exec(page, "set_freight_line", await liveFreight(page, { cached: true }));
  await page.evaluate(() => window.scrollTo({ top: 150, behavior: "smooth" }));
  await page.waitForTimeout(1800);
  await exec(page, "set_savings_summary", TOTALS);
  await exec(page, "set_worksheet_plan", { status: "Done — 2/2 lines matched. Review and file when ready." });
  await page.waitForTimeout(4800);
});

/* S1 — title card */
await scene("s1_title",
  TITLE("Shopify gave every store the <em>same ten tools</em>.",
    "This is what a merchant can do with WebMCP — on a real B2B store.",
    "Agent Quote Desk · packrift.com · built on webmcp-merchant-kit (MIT)"),
  async (page) => { await page.waitForTimeout(9500); });

/* S2 — PDP: fit check + find by dims */
await scene("s2_pdp",
  "https://packrift.com/products/12x12x12-ect-32-kraft-corrugated-cube-boxes-25-pack-bundle?oseid=vid",
  async (page) => {
    await page.evaluate(() => window.scrollTo({ top: 140, behavior: "smooth" }));
    await say(page, "u", 'Will an 11×11×11" part fit in this box?');
    await page.waitForTimeout(600);
    const fit = await exec(page, "check_fit_in_this_product", { item_length_in: 11, item_width_in: 11, item_depth_in: 11 });
    await page.evaluate((t) => window.__demoSay("a", t.slice(0, 150), 9), fit.content[0].text);
    await page.waitForTimeout(3800);
    await say(page, "u", 'I ship 3×3×8" candles, 1.2 lb — find me boxes.');
    const found = exec(page, "find_packaging_by_item_dims",
      { item_length_in: 3, item_width_in: 3, item_depth_in: 8, item_weight_lb: 1.2, use_case: "fragile" });
    await page.waitForTimeout(400);
    const r = await found;
    let head = "Found in-stock matches, ranked by fit.";
    try { const j = JSON.parse(r.content[0].text); head = "Top match: " + (j[0].title || j[0].handle); } catch { }
    await page.evaluate((t) => window.__demoSay("a", t.slice(0, 160), 9), head);
    await page.waitForTimeout(5500);
  });

/* S3 — the desk: paste + one-call painting + totals */
await scene("s3_desk", "https://packrift.com/pages/agent-desk?oseid=vid", async (page) => {
  await point(page, "#pk-paste", true);
  await page.click("#pk-paste");
  await page.type("#pk-paste", PASTE, { delay: 22 });
  await point(page, "#pk-zip", true);
  await page.fill("#pk-zip", "75201");
  await page.waitForTimeout(1600);
  await say(page, "u", "Beat this supplier quote on this page.");
  await page.waitForTimeout(1200);
  await say(page, "a", "Reading your worksheet… matching 2 lines against 13,000 SKUs.", 12);
  await exec(page, "beat_supplier_quote", {
    lines: [{ description: "S-4344 12x12x12 200# kraft box", quantity: 250 },
            { description: "6x9 poly bags 2 mil", quantity: 1000 }],
    supplier_total: 401, destination_zip: "75201" });
  await page.waitForTimeout(2800);
  await exec(page, "upsert_comparison_row", ROW1);
  await page.waitForTimeout(2000);
  await exec(page, "upsert_comparison_row", ROW2);
  await page.waitForTimeout(2400);
  await exec(page, "set_freight_line", await liveFreight(page));
  await page.waitForTimeout(2400);
  await exec(page, "set_savings_summary", TOTALS);
  await exec(page, "set_worksheet_plan", { status: "Done — 2/2 lines matched. Review and file when ready." });
  await say(page, "a", "Matched both lines with live freight. You save $48.77 (12.2%) on product. Want me to file it for a pay-ready quote?", 11);
  await page.waitForTimeout(9500);
});

/* S4 — consent + file + human-verify trust tier */
await scene("s4_file", "https://packrift.com/pages/agent-desk?oseid=vid4", async (page) => {
  await page.fill("#pk-paste", PASTE);
  await page.fill("#pk-zip", "75201");
  await exec(page, "upsert_comparison_row", ROW1);
  await exec(page, "upsert_comparison_row", ROW2);
  await exec(page, "set_freight_line", await liveFreight(page, { cached: true }));
  await exec(page, "set_savings_summary", TOTALS);
  await page.evaluate(() => window.scrollTo({ top: 150, behavior: "smooth" }));
  await say(page, "u", "Yes — file it. demo@packrift.com");
  await page.waitForTimeout(1800);
  await point(page, "#pk-file", true);
  const filed = await exec(page, "file_pay_ready_quote_from_worksheet",
    { buyer_email: "demo@packrift.com", company: "WebMCP demo", buyer_confirmed: true });
  await page.evaluate((t) => window.__demoSay("a", t.slice(0, 170), 11), filed.content[0].text);
  await page.waitForTimeout(8500);
});

/* S4b — native verification card */
await scene("s4b_verified",
  TITLE("Verified against the <em>native</em> API.",
    "Google Chrome 151 · real <code>document.modelContext</code> · 23 tools coexisting on one page —<br>Shopify's 10 built-ins + Packrift's 13 · zero collisions",
    "Reproducible: node scripts/verify-native.mjs"),
  async (page) => { await page.waitForTimeout(8000); });

/* S5 — outro card */
await scene("s5_outro",
  TITLE("Give your agents <em>a real job</em>.",
    "webmcp-merchant-kit — merchant tools alongside Shopify's built-ins.<br>webmcp.json: one file that tells agents what your site can do.",
    "github.com/farhanmunshi-ops/webmcp-merchant-kit · packrift.com/pages/agent-desk · MIT"),
  async (page) => { await page.waitForTimeout(9000); });

console.log("done:", readdirSync(OUT).filter((f) => f.endsWith(".webm")));
