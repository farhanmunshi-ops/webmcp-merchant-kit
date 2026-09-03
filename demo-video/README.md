# Programmatic demo video — no camera, no screen recorder

The submission video is generated entirely from code, so every frame is the real product:

1. `record.mjs` — Playwright drives real packrift.com pages through the actual WebMCP tools (a polyfilled `document.modelContext`, same surface as the native API) and records each scene at 1080p; a neutral "Your agent" overlay shows the conversation driving each action; live freight is fetched from the production MCP at record time.
2. `narrate.mjs` — narration per scene from `script.json` via OpenAI's `gpt-audio-1.5` (verbatim voiceover).
3. `assemble.mjs` — ffmpeg: eased push-in zooms, stat callouts, **burned-in captions** timed from the narration, freeze-padding, loudness-normalized mux, concat.

```bash
npm i playwright ffmpeg-static && npx playwright install chromium
node record.mjs && node narrate.mjs && node assemble.mjs
```
Set `OPENAI_API_KEY` in the environment (narrate.mjs reads it from `~/Downloads/env-openai.txt` in the original setup — adjust the path).
