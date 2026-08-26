import test from "node:test";
import assert from "node:assert/strict";
import { MerchantKit } from "../packages/merchant-kit/kit.js";
import { compileManifest } from "../packages/merchant-kit/recipes.js";

/** Minimal Web Model Context mock (mirrors the harness polyfill). */
function mockModelContext() {
  const tools = new Map();
  return {
    tools,
    async registerTool(def, opts = {}) {
      if (tools.has(def.name)) throw new Error(`dup ${def.name}`);
      tools.set(def.name, def);
      if (opts.signal) opts.signal.addEventListener("abort", () => tools.delete(def.name), { once: true });
    },
    async getTools() {
      return [...tools.values()].map(({ name, description, inputSchema, annotations }) =>
        ({ name, description, inputSchema, annotations }));
    },
    async executeTool(name, args) {
      return tools.get(name).execute(typeof args === "string" ? JSON.parse(args || "{}") : args || {}, {});
    },
  };
}

const dummy = (name, extra = {}) => ({
  name,
  description: "d",
  inputSchema: { type: "object", properties: {} },
  execute: async () => "ok",
  ...extra,
});

test("registers a tool and shapes string results into MCP content", async () => {
  const kit = new MerchantKit({ merchant: "t" });
  kit.mc = mockModelContext();
  assert.equal(await kit.registerTool(dummy("a")), true);
  const out = await kit.mc.executeTool("a", "{}");
  assert.deepEqual(out.content[0], { type: "text", text: "ok" });
});

test("skips name collisions with platform tools", async () => {
  const kit = new MerchantKit({ merchant: "t" });
  kit.mc = mockModelContext();
  await kit.mc.registerTool(dummy("update_cart")); // "platform" got there first
  assert.equal(await kit.registerTool(dummy("update_cart")), false);
  assert.equal(await kit.registerTool(dummy("mine")), true);
});

test("caps oversized outputs", async () => {
  const kit = new MerchantKit({ merchant: "t", maxOutputChars: 200 });
  kit.mc = mockModelContext();
  await kit.registerTool(dummy("big", { execute: async () => "x".repeat(5000) }));
  const out = await kit.mc.executeTool("big", "{}");
  assert.ok(out.content[0].text.length <= 200);
  assert.match(out.content[0].text, /truncated/);
});

test("execute errors become friendly text, never throws, and emit error events", async () => {
  const kit = new MerchantKit({ merchant: "t" });
  kit.mc = mockModelContext();
  const errors = [];
  kit.on("error", (e) => errors.push(e));
  await kit.registerTool(dummy("boom", { execute: async () => { throw new Error("nope"); } }));
  const out = await kit.mc.executeTool("boom", "{}");
  assert.match(out.content[0].text, /boom failed: nope/);
  assert.equal(errors.length, 1);
});

test("call/result events fire around execution", async () => {
  const kit = new MerchantKit({ merchant: "t" });
  kit.mc = mockModelContext();
  const log = [];
  kit.on("call", (e) => log.push(["call", e.tool]));
  kit.on("result", (e) => log.push(["result", e.tool]));
  await kit.registerTool(dummy("a"));
  await kit.mc.executeTool("a", "{}");
  assert.deepEqual(log, [["call", "a"], ["result", "a"]]);
});

test("unregisterAll aborts page-scoped tools", async () => {
  const kit = new MerchantKit({ merchant: "t" });
  kit.mc = mockModelContext();
  await kit.registerTool(dummy("scoped"));
  kit.unregisterAll();
  assert.equal(kit.mc.tools.has("scoped"), false);
});

test("compileManifest: static endpoint compiles and executes with zero network", async () => {
  const defs = compileManifest({ tools: [{
    name: "guide", description: "d", readOnly: true,
    endpoint: { type: "static", text: "hello agents" },
  }] });
  assert.equal(defs.length, 1);
  assert.equal(defs[0].annotations.readOnlyHint, true);
  assert.equal(await defs[0].execute({}), "hello agents");
});

test("compileManifest: refuses non-https and unknown endpoints", () => {
  const defs = compileManifest({ tools: [
    { name: "bad1", description: "d", endpoint: { type: "http", url: "http://insecure.example" } },
    { name: "bad2", description: "d", endpoint: { type: "wasm", url: "https://x" } },
    { name: "bad3", description: "d" },
  ] });
  assert.equal(defs.length, 0);
});

test("compileManifest: page filtering", () => {
  const manifest = { tools: [
    { name: "everywhere", description: "d", endpoint: { type: "static", text: "1" } },
    { name: "pdp_only", description: "d", pages: ["product"], endpoint: { type: "static", text: "2" } },
    { name: "desk_only", description: "d", pages: ["/pages/agent-desk"], endpoint: { type: "static", text: "3" } },
  ] };
  const home = compileManifest(manifest, { pageType: "default", pathname: "/" });
  assert.deepEqual(home.map((d) => d.name), ["everywhere"]);
  const pdp = compileManifest(manifest, { pageType: "product", pathname: "/products/x" });
  assert.deepEqual(pdp.map((d) => d.name), ["everywhere", "pdp_only"]);
  const desk = compileManifest(manifest, { pageType: "default", pathname: "/pages/agent-desk" });
  assert.deepEqual(desk.map((d) => d.name), ["everywhere", "desk_only"]);
});
