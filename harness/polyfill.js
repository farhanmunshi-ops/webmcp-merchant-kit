/**
 * Minimal Web Model Context polyfill for local testing and demos.
 * Implements registerTool / getTools / executeTool / toolchange on
 * document.modelContext (with the deprecated navigator alias), matching the
 * W3C Web Machine Learning draft closely enough to exercise real tool code.
 * Not for production — agent-capable browsers ship the real thing.
 */
(function () {
  if (document.modelContext && typeof document.modelContext.registerTool === "function") return;

  const tools = new Map();
  const listeners = new Set();
  const fire = () => {
    const ev = new Event("toolchange");
    listeners.forEach((fn) => { try { fn(ev); } catch {} });
  };

  const mc = {
    __polyfill: true,
    async registerTool(def, opts = {}) {
      if (!def || !def.name) throw new TypeError("tool needs a name");
      if (tools.has(def.name)) throw new DOMException(`tool '${def.name}' already registered`, "InvalidStateError");
      tools.set(def.name, def);
      if (opts.signal) {
        opts.signal.addEventListener("abort", () => { tools.delete(def.name); fire(); }, { once: true });
      }
      fire();
    },
    async getTools() {
      return [...tools.values()].map(({ name, description, inputSchema, annotations }) => ({
        name, description, inputSchema, annotations,
      }));
    },
    async executeTool(name, argsJson, opts = {}) {
      const def = tools.get(name);
      if (!def) throw new DOMException(`no tool '${name}'`, "NotFoundError");
      const input = typeof argsJson === "string" ? JSON.parse(argsJson || "{}") : (argsJson || {});
      return def.execute(input, { signal: opts.signal });
    },
    addEventListener(type, fn) { if (type === "toolchange") listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
  };

  Object.defineProperty(document, "modelContext", { value: mc, configurable: true });
  try { Object.defineProperty(navigator, "modelContext", { value: mc, configurable: true }); } catch {}
})();
