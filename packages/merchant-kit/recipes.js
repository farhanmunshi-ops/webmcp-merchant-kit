/**
 * webmcp.json — declarative merchant tools, no JavaScript required.
 *
 * A merchant describes their tools in one JSON manifest; the kit compiles each
 * entry into a live WebMCP tool at page load. What robots.txt was to crawlers
 * and sitemap.xml to indexing, webmcp.json aims to be for agent tools: the file
 * where a site says what an agent can DO here.
 *
 * Manifest shape:
 * {
 *   "merchant": "Acme Packaging",
 *   "tools": [{
 *     "name": "...", "description": "...",
 *     "inputSchema": { JSON Schema },
 *     "readOnly": true,
 *     "pages": ["default"] | ["product"] | ["/pages/some-path"],
 *     "endpoint": one of:
 *       { "type": "static", "text": "..." }                  // fixed answer
 *       { "type": "mcp",  "url": "https://…/mcp", "tool": "remote_tool_name" }
 *       { "type": "http", "url": "https://…", "method": "POST"|"GET" }
 *   }]
 * }
 *
 * Security model: the manifest must be same-origin (or explicitly allowed);
 * endpoints must be https; results are treated as data and size-shaped by the
 * kit. Static tools cost zero network. MCP endpoints speak JSON-RPC tools/call.
 */

let rpcId = 9000;

async function callMcp(url, tool, args) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  let body = await res.text();
  if (body.startsWith("event:") || body.startsWith("data:")) {
    for (const line of body.split("\n")) if (line.startsWith("data:")) { body = line.slice(5); break; }
  }
  const parsed = JSON.parse(body);
  if (parsed.error) throw new Error(parsed.error.message || "MCP error");
  return (parsed.result?.content || []).map((c) => c.text || "").join("\n");
}

function compileExecutor(endpoint) {
  if (!endpoint || typeof endpoint !== "object") return null;
  if (endpoint.type === "static" && typeof endpoint.text === "string") {
    return async () => endpoint.text;
  }
  if (endpoint.type === "mcp" && /^https:\/\//.test(endpoint.url || "") && endpoint.tool) {
    return (input) => callMcp(endpoint.url, endpoint.tool, input);
  }
  if (endpoint.type === "http" && /^https:\/\//.test(endpoint.url || "")) {
    const method = (endpoint.method || "POST").toUpperCase();
    return async (input) => {
      const res = method === "GET"
        ? await fetch(endpoint.url + (Object.keys(input || {}).length ? "?" + new URLSearchParams(input) : ""))
        : await fetch(endpoint.url, {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input || {}),
          });
      return res.text();
    };
  }
  return null; // unknown/unsafe endpoint — refuse to compile
}

/** Which manifest tools apply to the current page. */
function matchesPage(tool, pageType, pathname) {
  const pages = tool.pages || ["default"];
  return pages.some((p) => p === "default" || p === pageType || p === pathname);
}

/**
 * Compile a parsed webmcp.json manifest into kit tool definitions for the
 * current page. Pure — no network; unknown/unsafe endpoints are skipped.
 */
export function compileManifest(manifest, { pageType = "default", pathname = "/" } = {}) {
  const defs = [];
  for (const t of manifest.tools || []) {
    if (!t.name || !t.description || !matchesPage(t, pageType, pathname)) continue;
    const execute = compileExecutor(t.endpoint);
    if (!execute) continue;
    defs.push({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: "object", properties: {} },
      ...(t.readOnly ? { annotations: { readOnlyHint: true } } : {}),
      execute,
    });
  }
  return defs;
}

/**
 * Fetch a webmcp.json manifest and compile matching entries into kit tool
 * definitions. Returns definitions (register with kit.registerTool / registerPageTools).
 */
export async function loadRecipes(manifestUrl, ctx = {}) {
  const res = await fetch(manifestUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`webmcp.json fetch failed: ${res.status}`);
  return compileManifest(await res.json(), ctx);
}
