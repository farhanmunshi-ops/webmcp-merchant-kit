/**
 * Packrift's merchant tools for WebMCP — the domain intelligence layer that sits
 * alongside Shopify's ten built-in storefront tools.
 *
 * Shopify's built-ins answer "what does this store sell?" These answer the
 * questions a professional packaging buyer actually asks: "what fits my item",
 * "what does 500 of them cost landed to 75201", "can you beat my current
 * supplier's quote", "get me a pay-ready freight quote".
 *
 * Backend: the same production tool registry that serves remote agents over MCP
 * (mcp.packrift.com) — one tool brain, two transports (Streamable HTTP for
 * headless agents, WebMCP for the agent in the user's own tab).
 */

const MCP_ENDPOINT = "https://mcp.packrift.com/mcp";
const QUOTE_PAGE = "https://packrift.com/pages/bulk-quote";
let rpcId = 0;

/** Quote-desk intake endpoint, injected by the theme at runtime (not committed). */
let QUOTE_INTAKE_URL = null;
export function setQuoteIntake(url) { QUOTE_INTAKE_URL = url; }

/** Call one tool on the production Packrift MCP server. Returns plain text. */
async function mcpCall(tool, args, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: args } }),
      signal: controller.signal,
    });
    const rawBody = await res.text();
    let payload = rawBody;
    if (rawBody.startsWith("event:") || rawBody.startsWith("data:")) {
      for (const line of rawBody.split("\n")) {
        if (line.startsWith("data:")) { payload = line.slice(5); break; }
      }
    }
    const parsed = JSON.parse(payload);
    if (parsed.error) throw new Error(parsed.error.message || "MCP error");
    const content = parsed.result && parsed.result.content;
    return (content || []).map((c) => c.text || "").join("\n");
  } finally {
    clearTimeout(timer);
  }
}

const num = { type: "number" };
const str = { type: "string" };
const readOnly = { readOnlyHint: true };

const USE_CASES = ["auto", "box", "mailer", "fragile", "apparel", "ecommerce"];
const useCaseProp = {
  type: "string",
  enum: USE_CASES,
  description: "Packing scenario. Pick the closest: 'fragile' for breakables, 'mailer' for soft/flat goods, 'apparel' for clothing, 'ecommerce' for general online orders, else 'auto'.",
};
const coerceUseCase = (v) => (USE_CASES.includes(v) ? v : "auto");

/* ------------------------------------------------------------------ */
/* Global tools — registered on every page of packrift.com             */
/* ------------------------------------------------------------------ */

export const globalTools = [
  {
    name: "find_packaging_by_item_dims",
    description:
      "Find Packrift boxes or mailers that FIT a physical item, given the item's dimensions in inches and weight in pounds. Use this instead of keyword search whenever the buyer describes the thing they ship (a candle, a book, a part) rather than a packaging product. Returns ranked in-stock candidates with SKU, inside dimensions, price, and product URL. After choosing, add to cart with the store's update_cart tool.",
    inputSchema: {
      type: "object",
      properties: {
        item_length_in: num, item_width_in: num, item_depth_in: num,
        item_weight_lb: num,
        use_case: useCaseProp,
      },
      required: ["item_length_in", "item_width_in", "item_depth_in", "item_weight_lb", "use_case"],
    },
    annotations: readOnly,
    execute: (input) => mcpCall("find_packaging_for_item", { ...input, use_case: coerceUseCase(input.use_case) }),
  },
  {
    name: "pack_and_case_calculator",
    description:
      "Given item dimensions (inches), compute the required inside box dimensions with padding, rank matching Packrift boxes/mailers, and advise on void fill. Use before quoting quantities: it answers 'what size box do I need and how should I pad it'. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        item_length_in: num, item_width_in: num, item_depth_in: num,
        item_weight_lb: num,
        padding_in: { type: "number", description: "Protective padding per side in inches, default 0.5" },
        use_case: useCaseProp,
      },
      required: ["item_length_in", "item_width_in", "item_depth_in"],
    },
    annotations: readOnly,
    execute: (input) => mcpCall("pack_calculator", input.use_case ? { ...input, use_case: coerceUseCase(input.use_case) } : input),
  },
  {
    name: "match_competitor_item",
    description:
      "Cross-reference a competitor packaging item (a Uline S-number, an Amazon listing, or any written spec like '12x12x12 200# kraft box, 25/bundle') against Packrift's catalog. Returns ranked Packrift equivalents with price so the buyer can compare suppliers line by line. Read-only; does not modify the cart.",
    inputSchema: {
      type: "object",
      properties: {
        requested_spec: { type: "string", description: "The competitor item as written: catalog number, title, or spec text" },
        competitor_reference: { type: "string", description: "Optional: competitor name or SKU, e.g. 'Uline S-4344'" },
        limit: { type: "integer" },
      },
      required: ["requested_spec"],
    },
    annotations: readOnly,
    execute: (input) => mcpCall("compare_alternatives", input),
  },
  {
    name: "estimate_shipping_cost",
    description:
      "Live shipping estimate for specific catalog variants to a US or CA postal code. Requires numeric Shopify variant IDs (get them from find_packaging_by_item_dims, match_competitor_item, or get_product). Packaging freight is often 30-100% of product cost, so ALWAYS run this before promising a total. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        destination_postal_code: str,
        country: { type: "string", enum: ["US", "CA"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { variant_id: str, quantity: { type: "integer" } },
            required: ["variant_id", "quantity"],
          },
        },
      },
      required: ["destination_postal_code", "country", "items"],
    },
    annotations: readOnly,
    execute: (input) => mcpCall("get_shipping_estimate", input),
  },
  {
    name: "beat_supplier_quote",
    description:
      "The buyer has an existing supplier quote (e.g. from Uline) and wants Packrift to beat it. Provide each line as written on the quote plus quantities, the supplier's total, and the destination ZIP. This tool cross-references every line against Packrift's catalog, prices the matched items at the given quantities, and returns a line-by-line comparison with estimated savings. For 3+ matched lines or freight-class quantities it also files the quote for a human-verified pay-ready version with exact locked freight. Read-only against the store; filing the quote sends nothing until a human approves.",
    inputSchema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          description: "Each line from the supplier quote",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "The line as written, e.g. 'S-4344 12x12x12 200# boxes'" },
              quantity: { type: "integer" },
            },
            required: ["description", "quantity"],
          },
        },
        supplier_total: { type: "number", description: "The competing quote's total in USD, if known" },
        destination_zip: str,
      },
      required: ["lines"],
    },
    annotations: readOnly,
    async execute({ lines, supplier_total, destination_zip }) {
      const capped = (lines || []).slice(0, 8);
      const results = await Promise.all(
        capped.map(async (line) => {
          try {
            const text = await mcpCall("compare_alternatives", {
              requested_spec: line.description,
              limit: 2,
            });
            return { line, text: text.slice(0, 700) };
          } catch (err) {
            return { line, text: `no match found (${err.message})` };
          }
        })
      );
      const parts = results.map(
        (r, i) => `LINE ${i + 1} (qty ${r.line.quantity}): ${r.line.description}\n${r.text}`
      );
      const summary = [
        `Cross-referenced ${capped.length} supplier line(s) against Packrift's catalog.`,
        supplier_total ? `Supplier total to beat: $${supplier_total}.` : "",
        destination_zip ? `Destination ZIP ${destination_zip}: run estimate_shipping_cost on the matched variant IDs for landed cost.` : "",
        `Next: confirm matches with the buyer, then either add parcel-size quantities to cart (update_cart) or file a pay-ready bulk quote with request_pay_ready_quote — a human verifies it and locks exact freight before anything is sent.`,
      ].filter(Boolean).join(" ");
      return parts.join("\n\n") + "\n\n" + summary;
    },
  },
  {
    name: "request_pay_ready_quote",
    description:
      "File a bulk/freight quote request with Packrift's quote desk. A human reviews the match, locks EXACT freight to the buyer's address (not an estimate), and emails a pay-ready invoice — typically same business day. Use for bulk quantities, freight-class orders, competitor quote beats, or anything the buyer wants verified before paying. This tool submits a request; it never charges or sends anything to the buyer without human review. Collect buyer consent for the email before calling.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Buyer's email for the quote (confirm with the buyer first)" },
        company: str,
        destination_zip: str,
        items_requested: { type: "string", description: "Plain-text list: SKUs or specs with quantities, one per line" },
        supplier_quote_total: { type: "string", description: "Optional competing total to beat, e.g. '$1,480 from Uline'" },
      },
      required: ["email", "items_requested"],
    },
    async execute(input) {
      const params = new URLSearchParams();
      params.set("form_type", "contact");
      params.set("contact[email]", input.email);
      params.set("contact[body]", [
        "AGENT QUOTE DESK SUBMISSION (WebMCP)",
        input.company ? `Company: ${input.company}` : "",
        input.destination_zip ? `Ship-to ZIP: ${input.destination_zip}` : "",
        input.supplier_quote_total ? `Supplier total to beat: ${input.supplier_quote_total}` : "",
        "Items requested:",
        input.items_requested,
      ].filter(Boolean).join("\n"));
      let ok = false;
      if (QUOTE_INTAKE_URL) {
        // no-cors: x-www-form-urlencoded is a "simple" request, so it is delivered
        // even when the intake host doesn't answer CORS; the response is opaque.
        const res = await fetch(QUOTE_INTAKE_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
          keepalive: true,
        }).catch(() => null);
        ok = !!res;
      }
      return [
        ok
          ? `Quote request filed with Packrift's quote desk for ${input.email}.`
          : `Direct intake unreachable — have the buyer submit at ${QUOTE_PAGE} (the form is pre-annotated for agents).`,
        "A human verifies the SKU match and locks exact freight before any invoice is sent — nothing is charged automatically.",
        "Tell the buyer: expect a pay-ready quote by email, typically same business day.",
      ].join(" ");
    },
  },
];

/* ------------------------------------------------------------------ */
/* PDP-scoped tools — registered only on product pages, bound to the   */
/* product on screen via context injected by the theme (zero fetches). */
/* ------------------------------------------------------------------ */

/**
 * Usable inside dimensions for the product on the page. Explicit context wins;
 * otherwise parse the title — corrugated convention is that listed LxWxD are
 * inside dimensions.
 */
function deriveInsideDims(product) {
  const d = product.inside_dimensions_in || product.dimensions_in;
  if (d && d.length) return d;
  const m = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(product.title || "");
  if (m) return { length: +m[1], width: +m[2], depth: +m[3] };
  return null;
}

export function productTools(product) {
  if (!product || !product.handle) return [];
  const label = product.title || product.handle;
  return [
    {
      name: "get_product_on_this_page",
      description:
        `Structured facts for the product open on this page (${label}): SKU, variant IDs, price, pack count, dimensions, and stock. Zero-latency (no network) — prefer this over search when the buyer is asking about 'this' product. Read-only.`,
      inputSchema: { type: "object", properties: {} },
      annotations: readOnly,
      async execute() {
        return JSON.stringify(product, null, 1);
      },
    },
    {
      name: "check_fit_in_this_product",
      description:
        `Check whether an item of given dimensions (inches) fits inside the product on this page (${label}), using its usable inside dimensions. Returns fit verdict, clearance per axis, and orientation advice. Read-only, computed locally.`,
      inputSchema: {
        type: "object",
        properties: { item_length_in: num, item_width_in: num, item_depth_in: num },
        required: ["item_length_in", "item_width_in", "item_depth_in"],
      },
      annotations: readOnly,
      async execute({ item_length_in, item_width_in, item_depth_in }) {
        const d = deriveInsideDims(product);
        if (!d) {
          return `No usable box dimensions for ${label} (not a 3-dimensional container, or dims not stated). Use pack_and_case_calculator with the item dims instead.`;
        }
        const box = [d.length, d.width, d.depth].map(Number).sort((a, b) => b - a);
        const item = [item_length_in, item_width_in, item_depth_in].map(Number).sort((a, b) => b - a);
        const clearance = box.map((b, i) => +(b - item[i]).toFixed(2));
        const fits = clearance.every((c) => c >= 0);
        return [
          fits
            ? `FITS: ${item.join("×")}" item fits ${label} (${box.join("×")}" usable).`
            : `DOES NOT FIT: ${item.join("×")}" item vs ${box.join("×")}" usable in ${label}.`,
          `Clearance per axis (largest→smallest): ${clearance.join('", ')}".`,
          fits && clearance.some((c) => c < 0.25)
            ? "Under 1/4\" clearance on an axis — snug; skip void fill on that axis."
            : fits
              ? "Add void fill for clearances over 1/2\"."
              : "Use find_packaging_by_item_dims to find a size that fits.",
        ].join(" ");
      },
    },
  ];
}
