// One-time manual script: node scripts/fetch-symbols.mjs
// Downloads the Material Symbols Outlined subset for the names in src/ui/icon-names.ts.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/ui/icon-names.ts", "utf8");
const names = [...src.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
const cssUrl =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300,0..1,0" +
  `&icon_names=${names.join(",")}&display=block`;
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const css = await (await fetch(cssUrl, { headers: { "User-Agent": ua } })).text();
const url = css.match(/url\(([^)]+)\)/)?.[1];
if (!url) {
  console.error("No font url in CSS response (invalid icon name?):\n" + css);
  process.exit(1);
}
const res = await fetch(url);
if (!res.ok) {
  console.error(`Font download failed: ${res.status}`);
  process.exit(1);
}
writeFileSync("src/app/fonts/material-symbols-outlined.woff2", Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${names.length} icons`);
