#!/usr/bin/env node
// Fails CI if the client-side JS/CSS grows well past its current size —
// catches "accidentally bundled a huge new library" before it ships, not a
// precise perf budget. Only counts .vercel/output/static/assets (what
// actually ships to the browser), not the server-side function bundle.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ASSETS_DIR = ".vercel/output/static/assets";
const MAX_BYTES = 1.5 * 1024 * 1024; // ~2x today's ~700KB total, generous headroom

let files;
try {
  files = readdirSync(ASSETS_DIR).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
} catch {
  console.error(`Could not read ${ASSETS_DIR} — run "bun run build" first.`);
  process.exit(1);
}

const sizes = files
  .map((f) => ({ file: f, bytes: statSync(join(ASSETS_DIR, f)).size }))
  .sort((a, b) => b.bytes - a.bytes);

const total = sizes.reduce((sum, f) => sum + f.bytes, 0);

const fmt = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log("Client bundle sizes:");
for (const { file, bytes } of sizes) console.log(`  ${fmt(bytes).padStart(10)}  ${file}`);
console.log(`  ${fmt(total).padStart(10)}  TOTAL (budget: ${fmt(MAX_BYTES)})`);

if (total > MAX_BYTES) {
  console.error(
    `\nBundle size ${fmt(total)} exceeds the ${fmt(MAX_BYTES)} budget. If this growth is ` +
      `expected, raise MAX_BYTES in scripts/check-bundle-size.mjs and say why.`,
  );
  process.exit(1);
}
