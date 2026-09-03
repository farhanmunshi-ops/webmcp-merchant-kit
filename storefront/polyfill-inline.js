/**
 * Minimal Web Model Context polyfill, installed ONLY when the page is opened
 * with ?demo=1 in a browser that has no native document.modelContext — so
 * anyone (judges, merchants, curious buyers) can watch the tools work without
 * a flag or an agent browser. Mirrors the native surface verified in Chrome 151:
 * registerTool / getTools / executeTool(RegisteredTool, argsJson) / toolchange.
 */
export function installPolyfill() {
  if (document.modelContext && typeof document.modelContext.registerTool === "function") return false;
  const tools = new Map();
  const listeners = new Set();
  const fire = () => listeners.forEach((fn) => { try { fn(new Event("toolchange")); } catch { /* */ } });
  const mc = {
    __polyfill: true,
    async registerTool(def, opts = {}) {
      if (!def || !def.name) throw new TypeError("tool needs a name");
      if (tools.has(def.name)) throw new Error(`tool '${def.name}' already registered`);
      tools.set(def.name, def);
      if (opts.signal) opts.signal.addEventListener("abort", () => { tools.delete(def.name); fire(); }, { once: true });
      fire();
    },
    async getTools() {
      return [...tools.values()].map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));
    },
    async executeTool(tool, argsJson, opts = {}) {
      const name = typeof tool === "string" ? tool : tool && tool.name;
      const def = tools.get(name);
      if (!def) throw new Error(`no tool '${name}'`);
      const input = typeof argsJson === "string" ? JSON.parse(argsJson || "{}") : (argsJson || {});
      return def.execute(input, { signal: opts.signal });
    },
    addEventListener(type, fn) { if (type === "toolchange") listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
  };
  Object.defineProperty(document, "modelContext", { value: mc, configurable: true });
  try { Object.defineProperty(navigator, "modelContext", { value: mc, configurable: true }); } catch { /* */ }
  return true;
}
