# webmcp-merchant-kit

Your platform gave every site the same generic WebMCP tools. This kit registers **your** tools alongside them — safely.

```js
import { MerchantKit } from "webmcp-merchant-kit";

const kit = new MerchantKit({ merchant: "Acme" });
if (await kit.connect()) {
  await kit.registerTool({
    name: "check_fit",
    description: "Does an item of given dimensions fit this product?",
    inputSchema: { type: "object", properties: { l: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["l", "w", "h"] },
    annotations: { readOnlyHint: true },
    async execute({ l, w, h }) { return fitVerdict(l, w, h); },
  });
}
```

Or no JavaScript at all — a **webmcp.json** manifest:

```js
import { loadRecipes } from "webmcp-merchant-kit/recipes";
for (const def of await loadRecipes("/webmcp.json")) await kit.registerTool(def);
```

- Waits for `document.modelContext` (late injection tolerated; `navigator` fallback)
- Skips name collisions with tools the platform already registered
- Page-scoped registration with `AbortController` unregistration
- Output shaping, error capture that never breaks the page
- Events (`register`/`call`/`result`/`error`) to drive a visible activity UI
- Declarative `<form>` annotation helper for the WebMCP declarative API

Flagship deployment, docs, and the full story: [github.com/farhanmunshi-ops/webmcp-merchant-kit](https://github.com/farhanmunshi-ops/webmcp-merchant-kit). MIT.
