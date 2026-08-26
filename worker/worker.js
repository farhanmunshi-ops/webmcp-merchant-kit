/**
 * packrift-webmcp-telemetry — anonymous, aggregate-only counters for WebMCP tool
 * activity on packrift.com. No PII, no IPs stored, no per-user anything: just
 * "tool X was called N times on day D". Powers the live proof line on the
 * Agent Quote Desk and the public /stats endpoint.
 *
 * POST /event  {tool, page}  -> 204
 * GET  /stats                -> {since, days: {date: {tool: n}}, totals: {tool: n}, total_calls}
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TOOL_RE = /^[a-z][a-z0-9_]{2,60}$/;
const PAGE_RE = /^[a-z0-9_/-]{1,40}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (request.method === "POST" && url.pathname === "/event") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
      const tool = String(body.tool || "");
      const page = String(body.page || "unknown");
      if (!TOOL_RE.test(tool)) return json({ error: "bad tool" }, 400);
      const day = new Date().toISOString().slice(0, 10);
      const key = `day:${day}`;
      // Low-traffic read-modify-write; rare lost increments are acceptable for
      // approximate public counters (labeled as such wherever displayed).
      const cur = (await env.STATS.get(key, "json")) || {};
      cur[tool] = (cur[tool] || 0) + 1;
      if (PAGE_RE.test(page)) {
        cur.__pages = cur.__pages || {};
        cur.__pages[page] = (cur.__pages[page] || 0) + 1;
      }
      await env.STATS.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 120 });
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "GET" && url.pathname === "/stats") {
      const list = await env.STATS.list({ prefix: "day:" });
      const days = {};
      const totals = {};
      let total = 0;
      for (const k of list.keys) {
        const d = (await env.STATS.get(k.name, "json")) || {};
        days[k.name.slice(4)] = d;
        for (const [tool, n] of Object.entries(d)) {
          if (tool === "__pages") continue;
          totals[tool] = (totals[tool] || 0) + n;
          total += n;
        }
      }
      return json({
        about: "Approximate, anonymous, aggregate WebMCP tool-call counts on packrift.com. No PII collected.",
        since: Object.keys(days).sort()[0] || null,
        days, totals, total_calls: total,
      });
    }

    return json({
      service: "packrift-webmcp-telemetry",
      endpoints: { "POST /event": "{tool, page}", "GET /stats": "aggregate counters" },
    });
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 1), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
}
