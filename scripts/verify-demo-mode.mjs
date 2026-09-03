/** Verifies ?demo=1 in a browser WITHOUT native WebMCP (bundled Chromium): polyfill installs, demo button runs the real flow. */
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("https://packrift.com/pages/agent-desk?demo=1&oseid=demo" + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
const before = await page.evaluate(() => ({ polyfilled: !!(document.modelContext && document.modelContext.__polyfill), demoBtn: !!document.getElementById("pk-demo") && !document.getElementById("pk-demo").hidden }));
await page.click("#pk-demo");
await page.waitForTimeout(45000);
const after = await page.evaluate(() => ({ plan: document.getElementById("pk-plan").textContent, rows: document.querySelectorAll("#pk-rows tr").length, freight: document.getElementById("pk-t-freight").textContent, save: document.getElementById("pk-t-save").textContent }));
console.log(JSON.stringify({ before, after }, null, 1));
await browser.close();
