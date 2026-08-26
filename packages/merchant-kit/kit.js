/**
 * webmcp-merchant-kit — register merchant-specific WebMCP tools on any storefront,
 * safely, alongside platform-provided tools (e.g. Shopify's built-in ten).
 *
 * Shopify registers the same 10 generic tools on every storefront. This kit is the
 * extension point the platform didn't ship: it waits for the browser's Web Model
 * Context API, avoids name collisions with tools that are already registered,
 * scopes tools to the page they belong on, shapes outputs to agent-friendly sizes,
 * and emits events a visible UI can subscribe to so the human can watch the agent work.
 *
 * Zero dependencies. MIT.
 */

const DEFAULT_MAX_OUTPUT_CHARS = 1400;

/** Resolve the Web Model Context API, waiting briefly for late injection. */
export function whenModelContext({ timeoutMs = 8000, pollMs = 250 } = {}) {
  const get = () =>
    (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext) ||
    null;
  return new Promise((resolve) => {
    const found = get();
    if (found && typeof found.registerTool === "function") return resolve(found);
    const started = Date.now();
    const timer = setInterval(() => {
      const mc = get();
      if (mc && typeof mc.registerTool === "function") {
        clearInterval(timer);
        resolve(mc);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, pollMs);
  });
}

export class MerchantKit {
  /**
   * @param {object} opts
   * @param {string} opts.merchant       Human name, used in logs/UI ("Packrift").
   * @param {number} [opts.maxOutputChars]
   */
  constructor({ merchant, maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS } = {}) {
    this.merchant = merchant || "merchant";
    this.maxOutputChars = maxOutputChars;
    this.mc = null;
    this.registered = new Map(); // name -> { def, controller }
    this._listeners = { register: [], call: [], result: [], error: [] };
  }

  on(event, fn) {
    (this._listeners[event] || (this._listeners[event] = [])).push(fn);
    return this;
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event] || []) {
      try { fn(payload); } catch { /* listener errors never break tools */ }
    }
  }

  async connect(opts) {
    this.mc = await whenModelContext(opts);
    return this.mc;
  }

  /** Names of tools other scripts (e.g. the platform) already registered. */
  async existingToolNames() {
    if (!this.mc || typeof this.mc.getTools !== "function") return new Set();
    try {
      const tools = await this.mc.getTools();
      return new Set((tools || []).map((t) => t.name).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  /**
   * Register one tool. Skips (and reports) on name collision with an
   * already-registered tool. Wraps execute with timing, error capture,
   * output shaping, and kit events.
   * @returns {Promise<boolean>} true if registered
   */
  async registerTool(def, { skipCollisionCheck = false } = {}) {
    if (!this.mc) return false;
    if (this.registered.has(def.name)) return false;
    if (!skipCollisionCheck) {
      const taken = await this.existingToolNames();
      if (taken.has(def.name)) {
        this._emit("error", { tool: def.name, error: "name collision — skipped" });
        return false;
      }
    }
    const kit = this;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const wrapped = {
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema,
      ...(def.annotations ? { annotations: def.annotations } : {}),
      async execute(input, ctx) {
        const startedAt = Date.now();
        kit._emit("call", { tool: def.name, input });
        try {
          const raw = await def.execute(input, ctx);
          const shaped = kit._shape(raw);
          kit._emit("result", { tool: def.name, input, ms: Date.now() - startedAt, output: shaped });
          return shaped;
        } catch (err) {
          const message = `${def.name} failed: ${err && err.message ? err.message : String(err)}`;
          kit._emit("error", { tool: def.name, input, ms: Date.now() - startedAt, error: message });
          return { content: [{ type: "text", text: message + " — tell the human on the page; they can use the site UI instead." }] };
        }
      },
    };
    try {
      const opts = controller ? { signal: controller.signal } : undefined;
      await this.mc.registerTool(wrapped, opts);
      this.registered.set(def.name, { def, controller });
      this._emit("register", { tool: def.name, readOnly: !!(def.annotations && def.annotations.readOnlyHint) });
      return true;
    } catch (err) {
      this._emit("error", { tool: def.name, error: `registerTool rejected: ${err && err.message}` });
      return false;
    }
  }

  /** Register a set of tools only when `match` is true for the current page. */
  async registerPageTools(match, defs) {
    if (!match) return 0;
    let count = 0;
    for (const def of defs) if (await this.registerTool(def)) count++;
    return count;
  }

  /** Unregister every tool this kit registered (via AbortController). */
  unregisterAll() {
    for (const [name, { controller }] of this.registered) {
      try { controller && controller.abort(); } catch { /* already gone */ }
      this.registered.delete(name);
    }
  }

  /**
   * Progressive enhancement for the declarative WebMCP form API: annotate a real
   * <form> so browsers that support declarative tools expose it directly. Field
   * descriptions come from `params` (name -> description).
   */
  annotateForm(form, { toolname, tooldescription, params = {}, autosubmit = false } = {}) {
    if (!form) return false;
    form.setAttribute("toolname", toolname);
    form.setAttribute("tooldescription", tooldescription);
    if (autosubmit) form.setAttribute("toolautosubmit", "");
    for (const [name, desc] of Object.entries(params)) {
      const field = form.elements.namedItem(name);
      if (field && field.setAttribute) field.setAttribute("toolparamdescription", desc);
    }
    return true;
  }

  /** Shape any tool result into MCP content form, capped for agent context budgets. */
  _shape(raw) {
    let text;
    if (raw && Array.isArray(raw.content)) {
      text = raw.content.map((c) => (c && c.text) || "").join("\n");
    } else if (typeof raw === "string") {
      text = raw;
    } else {
      text = JSON.stringify(raw, null, 1);
    }
    if (text.length > this.maxOutputChars) {
      text = text.slice(0, this.maxOutputChars - 60) +
        `\n…truncated. Ask a narrower question or use a more specific tool.`;
    }
    return { content: [{ type: "text", text }] };
  }
}
