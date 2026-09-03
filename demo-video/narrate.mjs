/** Generates per-scene narration WAVs with gpt-audio-1.5. */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const KEY = readFileSync(process.env.HOME + "/Downloads/env-openai.txt", "utf8").match(/sk-[A-Za-z0-9_-]+/)[0];
mkdirSync(new URL("./audio/", import.meta.url).pathname, { recursive: true });

const SCRIPT = JSON.parse(readFileSync(new URL("./script.json", import.meta.url), "utf8"));

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
