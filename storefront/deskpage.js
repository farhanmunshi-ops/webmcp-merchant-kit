/**
 * Agent Quote Desk — a shared worksheet that a buyer and their in-browser agent
 * work together, live on packrift.com/pages/agent-desk.
 *
 * The novel part: these page-scoped WebMCP tools don't just answer the agent —
 * their side effect is the HUMAN'S SCREEN. The agent reads what the buyer pasted
 * (read_quote_worksheet), then builds the comparison table row by row
 * (upsert_comparison_row), sets freight (set_freight_line), totals the savings
 * (set_savings_summary), and — only with the buyer's consent — files the
 * worksheet for a human-verified pay-ready quote. The buyer watches the
 * worksheet fill in as the agent works, and can edit or file it manually at any
 * point: the page is fully usable with no agent at all.
 */

const CSS = `
#pk-desk-root{--pk-accent:#e86100;--pk-ink:#1a1a1a;--pk-paper:#fff;--pk-bg:#faf7f3;
  --pk-line:#e5e0da;--pk-dim:#6f675e;--pk-good:#1a7f37;
  font-family:Inter,-apple-system,system-ui,sans-serif;color:var(--pk-ink);
  max-width:1080px;margin:0 auto;padding:8px 16px 48px;font-size:15px;line-height:1.55}
@media (prefers-color-scheme:dark){#pk-desk-root{--pk-ink:#f2ede7;--pk-paper:#211d19;
  --pk-bg:#181512;--pk-line:#3a342d;--pk-dim:#a89e92;--pk-good:#4ac26b}}
#pk-desk-root h1{font-size:30px;line-height:1.2;margin:18px 0 6px;font-weight:800}
#pk-desk-root .pk-sub{color:var(--pk-dim);max-width:760px;margin:0 0 22px}
#pk-desk-root .pk-grid{display:grid;grid-template-columns:minmax(280px,380px) 1fr;gap:20px}
@media (max-width:860px){#pk-desk-root .pk-grid{grid-template-columns:1fr}}
#pk-desk-root .pk-card{background:var(--pk-paper);border:1px solid var(--pk-line);
  border-radius:14px;padding:18px}
#pk-desk-root .pk-card h2{font-size:15px;font-weight:700;margin:0 0 10px}
#pk-desk-root textarea,#pk-desk-root input{width:100%;box-sizing:border-box;
  background:var(--pk-bg);color:var(--pk-ink);border:1px solid var(--pk-line);
  border-radius:9px;padding:10px 12px;font:inherit;font-size:14px}
#pk-desk-root textarea{min-height:170px;resize:vertical}
#pk-desk-root label{display:block;font-size:12px;font-weight:600;color:var(--pk-dim);
  margin:12px 0 4px;text-transform:uppercase;letter-spacing:.04em}
#pk-desk-root .pk-btn{display:inline-block;background:var(--pk-accent);color:#fff;border:none;
  border-radius:9px;padding:11px 18px;font-weight:700;font-size:14px;cursor:pointer;margin-top:14px}
#pk-desk-root .pk-btn[disabled]{opacity:.5;cursor:default}
#pk-desk-root .pk-plan{font-weight:600;color:var(--pk-accent);min-height:22px;margin:2px 0 10px}
#pk-desk-root table{width:100%;border-collapse:collapse;font-size:13.5px}
#pk-desk-root th{text-align:left;color:var(--pk-dim);font-size:11px;text-transform:uppercase;
  letter-spacing:.05em;padding:6px 8px;border-bottom:1px solid var(--pk-line)}
#pk-desk-root td{padding:9px 8px;border-bottom:1px solid var(--pk-line);vertical-align:top}
#pk-desk-root td a{color:var(--pk-accent);font-weight:600;text-decoration:none}
#pk-desk-root .pk-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
#pk-desk-root .pk-delta-good{color:var(--pk-good);font-weight:700}
#pk-desk-root .pk-empty{color:var(--pk-dim);text-align:center;padding:26px 8px}
#pk-desk-root .pk-totals{display:flex;gap:26px;flex-wrap:wrap;margin-top:14px;
  padding-top:12px;border-top:2px solid var(--pk-ink)}
#pk-desk-root .pk-totals div b{display:block;font-size:11px;color:var(--pk-dim);
  text-transform:uppercase;letter-spacing:.05em;font-weight:600}
#pk-desk-root .pk-totals div span{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
#pk-desk-root .pk-totals .pk-save span{color:var(--pk-good)}
#pk-desk-root .pk-banner{margin-top:14px;padding:12px 14px;border-radius:10px;
  background:rgba(26,127,55,.1);color:var(--pk-good);font-weight:600;display:none}
#pk-desk-root .pk-agenthint{background:var(--pk-bg);border:1px dashed var(--pk-line);
  border-radius:10px;padding:12px 14px;font-size:13px;color:var(--pk-dim);margin-top:16px}
#pk-desk-root .pk-agenthint code{user-select:all;color:var(--pk-ink);font-size:12.5px}
#pk-desk-root .pk-foot{margin-top:26px;color:var(--pk-dim);font-size:12.5px;max-width:820px}
`;

const money = (n) => (n == null || isNaN(+n) ? "—" : "$" + (+n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","));

export function mountDeskPage(kit, cfg) {
  const root = document.getElementById("pk-desk-root");
  if (!root) return [];

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  root.innerHTML = `
    <h1>Agent Quote Desk</h1>
    <p class="pk-sub">Paste your current supplier quote — Uline, Amazon, anyone, any format. Your AI
    agent cross-references every line against Packrift's catalog and builds the comparison right here
    while you watch. When it looks right, file it: a human verifies the match, locks <b>exact</b>
    freight to your dock, and emails a pay-ready quote. Nothing is charged automatically.</p>
    <div class="pk-grid">
      <div class="pk-card">
        <h2>1 · Your current quote</h2>
        <textarea id="pk-paste" placeholder="Example:&#10;S-4344 12x12x12 200# boxes — 250 @ $1.42&#10;6x9 poly bags 2 mil — 1,000 @ $0.031&#10;Total: $612.00"></textarea>
        <label for="pk-zip">Ship-to ZIP</label>
        <input id="pk-zip" autocomplete="postal-code" placeholder="75201">
        <label for="pk-email">Email for the pay-ready quote</label>
        <input id="pk-email" type="email" autocomplete="email" placeholder="you@company.com">
        <div class="pk-agenthint">Using an agent-capable browser? Just ask:
        <code>Beat this supplier quote on this page.</code> The desk exposes its worksheet to your
        agent as tools — it will read your paste, match every line, and fill the table for you.</div>
      </div>
      <div class="pk-card">
        <h2>2 · Packrift comparison</h2>
        <div class="pk-plan" id="pk-plan"></div>
        <div style="overflow-x:auto"><table>
          <thead><tr><th>Your line</th><th>Packrift match</th>
          <th class="pk-num">Qty</th><th class="pk-num">Packrift total</th><th class="pk-num">Δ</th></tr></thead>
          <tbody id="pk-rows"><tr><td colspan="5" class="pk-empty">No lines yet — paste a quote and
          ask your agent, or add lines by filing the form.</td></tr></tbody>
        </table></div>
        <div class="pk-totals">
          <div><b>Supplier total</b><span id="pk-t-supplier">—</span></div>
          <div><b>Packrift subtotal</b><span id="pk-t-sub">—</span></div>
          <div><b>Freight</b><span id="pk-t-freight">—</span></div>
          <div class="pk-save"><b>You save</b><span id="pk-t-save">—</span></div>
        </div>
        <button class="pk-btn" id="pk-file">File for a pay-ready quote</button>
        <div class="pk-banner" id="pk-banner"></div>
      </div>
    </div>
    <p class="pk-foot">This desk is part of Packrift's agentic storefront: the same tool registry
    serves in-browser agents over WebMCP, remote agents over MCP at mcp.packrift.com, and checkout
    agents over Shopify's UCP. Bulk quotes are always verified by a human before an invoice is sent.</p>`;

  const $ = (id) => root.querySelector(id);
  const state = { rows: new Map(), freight: null, totals: {}, filed: false };

  const renderRows = () => {
    const tbody = $("#pk-rows");
    if (!state.rows.size) return;
    tbody.innerHTML = "";
    for (const r of state.rows.values()) {
      const delta = r.supplier_line_total != null && r.packrift_line_total != null
        ? r.supplier_line_total - r.packrift_line_total : null;
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${esc(r.supplier_line)}</td>` +
        `<td>${r.packrift_url ? `<a href="${esc(r.packrift_url)}" target="_blank">${esc(r.packrift_title || r.packrift_sku)}</a>` : esc(r.note || "no match")}` +
        (r.confidence && r.confidence !== "high" ? ` <small>(${esc(r.confidence)} confidence)</small>` : "") + `</td>` +
        `<td class="pk-num">${r.quantity ?? "—"}</td>` +
        `<td class="pk-num">${money(r.packrift_line_total)}</td>` +
        `<td class="pk-num ${delta > 0 ? "pk-delta-good" : ""}">${delta == null ? "—" : (delta >= 0 ? "−" : "+") + money(Math.abs(delta)).slice(1)}</td>`;
      tbody.appendChild(tr);
    }
  };

  const renderTotals = () => {
    const t = state.totals;
    $("#pk-t-supplier").textContent = money(t.supplier_total);
    $("#pk-t-sub").textContent = money(t.packrift_subtotal);
    $("#pk-t-freight").textContent = state.freight
      ? (state.freight.amount_usd != null ? money(state.freight.amount_usd) : state.freight.status || "—")
      : "—";
    $("#pk-t-save").textContent = t.savings_usd != null
      ? `${money(t.savings_usd)}${t.savings_pct != null ? ` (${t.savings_pct}%)` : ""}` : "—";
  };

  const fileWorksheet = async (email, company) => {
    const rows = [...state.rows.values()];
    const body = [
      "AGENT QUOTE DESK WORKSHEET",
      company ? `Company: ${company}` : "",
      $("#pk-zip").value ? `Ship-to ZIP: ${$("#pk-zip").value}` : "",
      state.totals.supplier_total != null ? `Supplier total to beat: ${money(state.totals.supplier_total)}` : "",
      "",
      ...(rows.length
        ? rows.map((r) => `- ${r.supplier_line} | qty ${r.quantity ?? "?"} -> ${r.packrift_sku || r.packrift_title || "NO MATCH"} @ ${money(r.packrift_line_total)}`)
        : ["(no matched rows — raw paste below)"]),
      "",
      "Raw paste:", $("#pk-paste").value || "(empty)",
    ].filter((l) => l != null).join("\n");
    const params = new URLSearchParams();
    params.set("form_type", "contact");
    params.set("contact[email]", email);
    params.set("contact[body]", body);
    let ok = false;
    if (cfg.quoteIntakeUrl) {
      const res = await fetch(cfg.quoteIntakeUrl, {
        method: "POST", mode: "no-cors", keepalive: true,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }).catch(() => null);
      ok = !!res;
    }
    state.filed = true;
    const banner = $("#pk-banner");
    banner.style.display = "block";
    banner.textContent = ok
      ? `Filed. A human verifies the match and locks exact freight — pay-ready quote goes to ${email}, typically same business day.`
      : `Couldn't reach the quote desk directly — your worksheet is preserved above; use the bulk quote page as a fallback.`;
    return ok;
  };

  $("#pk-file").addEventListener("click", async () => {
    const email = $("#pk-email").value.trim();
    if (!email) { $("#pk-email").focus(); return; }
    $("#pk-file").disabled = true;
    await fileWorksheet(email, "");
  });

  /* ---------------- desk-scoped WebMCP tools ---------------- */
  const str = { type: "string" };
  const num = { type: "number" };
  return [
    {
      name: "read_quote_worksheet",
      description:
        "Read the Agent Quote Desk worksheet the buyer is looking at on this page: their pasted supplier quote (raw text), ship-to ZIP, email if given, and any comparison rows already present. ALWAYS call this first on the desk page — the buyer's paste is the source of truth for what to match. Read-only.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        return JSON.stringify({
          pasted_supplier_quote: $("#pk-paste").value || "(empty — ask the buyer to paste their quote, or collect lines in chat)",
          ship_to_zip: $("#pk-zip").value || null,
          buyer_email: $("#pk-email").value || null,
          rows: [...state.rows.values()],
          totals: state.totals,
          freight: state.freight,
          filed: state.filed,
        }, null, 1);
      },
    },
    {
      name: "set_worksheet_plan",
      description:
        "Show the buyer what you're doing on the desk right now, in one short sentence (e.g. 'Matching 4 lines from your Uline quote…'). Sets the status line above the comparison table. Call it when you start and when you finish.",
      inputSchema: { type: "object", properties: { status: str }, required: ["status"] },
      async execute({ status }) {
        $("#pk-plan").textContent = status.slice(0, 120);
        return "Status shown to the buyer.";
      },
    },
    {
      name: "upsert_comparison_row",
      description:
        "Write one matched line into the comparison table the buyer is watching. Use one row per line of their supplier quote (row_id = 'line1', 'line2', …; reuse an id to update). Get matches with match_competitor_item and prices with the store's product tools first. Money in USD numbers.",
      inputSchema: {
        type: "object",
        properties: {
          row_id: str,
          supplier_line: { type: "string", description: "The line as written on the buyer's quote" },
          quantity: { type: "integer" },
          packrift_sku: str, packrift_title: str,
          packrift_url: { type: "string", description: "Product URL on packrift.com" },
          packrift_line_total: { type: "number", description: "Packrift total for this line at that quantity, USD" },
          supplier_line_total: { type: "number", description: "The supplier's total for this line if stated, USD" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          note: { type: "string", description: "Only for no-match/caveats, shown to the buyer" },
        },
        required: ["row_id", "supplier_line"],
      },
      async execute(row) {
        state.rows.set(row.row_id, row);
        renderRows();
        return `Row ${row.row_id} shown to the buyer (${state.rows.size} rows on the desk).`;
      },
    },
    {
      name: "set_freight_line",
      description:
        "Set the freight line on the worksheet. Use estimate_shipping_cost for the number; status 'estimated' for live estimates, 'quoted' only for human-locked freight, 'needs_quote' when freight requires the human desk (oversize, LTL, AK/HI).",
      inputSchema: {
        type: "object",
        properties: { amount_usd: num, status: { type: "string", enum: ["estimated", "quoted", "needs_quote"] }, note: str },
        required: ["status"],
      },
      async execute(f) {
        state.freight = f;
        renderTotals();
        return "Freight line shown to the buyer.";
      },
    },
    {
      name: "set_savings_summary",
      description:
        "Set the worksheet totals the buyer sees: supplier total, Packrift subtotal, and savings. Compute savings on comparable matched lines only; never overstate — if freight is unknown, leave savings on product subtotal and say so in set_worksheet_plan.",
      inputSchema: {
        type: "object",
        properties: {
          supplier_total: num, packrift_subtotal: num,
          savings_usd: num, savings_pct: num,
        },
        required: ["packrift_subtotal"],
      },
      async execute(t) {
        state.totals = t;
        renderTotals();
        return "Totals shown to the buyer.";
      },
    },
    {
      name: "file_pay_ready_quote_from_worksheet",
      description:
        "File the worksheet with Packrift's quote desk so a human verifies every match, locks EXACT freight, and emails a pay-ready quote. REQUIRES the buyer's explicit consent in conversation AND their email. This never charges anyone — a human reviews before anything is sent.",
      inputSchema: {
        type: "object",
        properties: {
          buyer_email: str,
          company: str,
          buyer_confirmed: { type: "boolean", description: "true only after the buyer explicitly agreed to file this worksheet" },
        },
        required: ["buyer_email", "buyer_confirmed"],
      },
      async execute({ buyer_email, company, buyer_confirmed }) {
        if (!buyer_confirmed) return "Not filed: ask the buyer to confirm first (buyer_confirmed=true).";
        $("#pk-email").value = buyer_email;
        const ok = await fileWorksheet(buyer_email, company || "");
        return ok
          ? `Worksheet filed for ${buyer_email}. Tell the buyer: a human verifies the match and locks exact freight; pay-ready quote by email, typically same business day.`
          : "Intake unreachable — the worksheet is preserved on screen; the buyer can submit at /pages/bulk-quote.";
      },
    },
  ];
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
