import { build } from "esbuild";

// MV3 content scripts cannot use `"type": "module"`, so the ES-module
// source in extension/content/content.js (which the Node test suite
// imports directly) is bundled into a plain IIFE here for the manifest
// to load. Source modules stay untouched for `npm test`.
await build({
  entryPoints: ["extension/content/content.js"],
  outfile: "extension/content/content.bundle.js",
  bundle: true,
  format: "iife",
  target: "chrome110",
  logLevel: "info",
});
