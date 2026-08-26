/** Generates per-scene narration WAVs with gpt-audio-1.5. */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const KEY = process.env.OPENAI_API_KEY; if (!KEY) throw new Error("set OPENAI_API_KEY");
mkdirSync(new URL("./audio/", import.meta.url).pathname, { recursive: true });

const SCRIPT = {
  s0_cold:
    "Your agent just beat your supplier's quote — live, on a real store. Forty nine dollars saved. Here's how.",
  s1_title:
    "Shopify just switched on WebMCP for millions of storefronts — ten generic tools, identical everywhere. Here's what a merchant can do when the store itself speaks to your agent.",
  s2_pdp:
    "Packrift is a real packaging distributor — thirteen thousand SKUs. Every page hands your agent domain tools. On a product page: will an eleven inch part fit this box? Answered instantly, from the page's own spec data. Describe what you ship, and it finds boxes that fit — ranked, in stock, with prices.",
  s3_desk:
    "The centerpiece: the Agent Quote Desk. Paste your current supplier quote — any format. The agent reads your worksheet, cross-references every line against the catalog, and paints the comparison onto your screen as it works. Live freight to your ZIP — the number that makes or breaks packaging orders. Supplier total, Packrift total — and the savings, line by line. Forty nine dollars on this order. Human and agent, working the same worksheet.",
  s4_file:
    "Parcel orders? The agent finishes checkout itself, with Shopify's own built-in tools. Bulk freight takes the buyer's consent — and then a human verifies every match and locks exact freight before a pay-ready invoice goes out. Right-sized autonomy, on a real store.",
  s5_outro:
    "webmcp merchant kit. Open source, M I T. Point it at your store — and give your agents a real job.",
};

import { existsSync } from "node:fs";
for (const [name, text] of Object.entries(SCRIPT)) {
  const outPath = new URL(`./audio/${name}.wav`, import.meta.url).pathname;
  if (!process.env.FORCE && existsSync(outPath)) { console.log(name, "exists, skipped"); continue; }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-audio-1.5",
      modalities: ["text", "audio"],
      audio: { voice: "onyx", format: "wav" },
      messages: [
        { role: "system", content: "You are the voiceover artist for a polished product launch video. Read the user's script aloud VERBATIM — confident, warm, measured pace with natural pauses at dashes. Do not add, drop, or change any words." },
        { role: "user", content: text },
      ],
    }),
  });
  const d = await res.json();
  const b64 = d.choices?.[0]?.message?.audio?.data;
  if (!b64) { console.error(name, "FAILED", JSON.stringify(d).slice(0, 200)); continue; }
  const buf = Buffer.from(b64, "base64");
  writeFileSync(new URL(`./audio/${name}.wav`, import.meta.url).pathname, buf);
  // 24kHz mono 16-bit PCM → seconds ≈ (bytes - 44) / 48000
  console.log(name, ((buf.length - 44) / 48000).toFixed(1) + "s");
}
