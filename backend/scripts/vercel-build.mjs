import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".vercel/output");
const fn = resolve(out, "functions/api.func");

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/vercel.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(fn, "index.mjs"),
  banner: { js: "import { createRequire as __ojRequire } from 'node:module'; const require = __ojRequire(import.meta.url);" },
  logLevel: "warning",
});

writeFileSync(
  resolve(fn, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);
writeFileSync(resolve(out, "config.json"), JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/api" }] }, null, 2));

console.log(`Vercel build output written to ${out}`);
