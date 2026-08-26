/** Bundle the storefront entry into one theme-ready asset (IIFE, no deps). */
import { build } from "esbuild";

await build({
  entryPoints: ["storefront/main.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: "dist/packrift-webmcp.js",
  banner: { js: "/* Packrift WebMCP merchant tools — https://github.com/<repo> (MIT). Built with webmcp-merchant-kit. */" },
});
console.log("built dist/packrift-webmcp.js");
