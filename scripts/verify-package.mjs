import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
const archive = join(ROOT, "dist", `drive-zip-namer-${manifest.version}.zip`);

runUnzip(["-t", archive], "配布ZIPが破損しています。");
const entries = runUnzip(["-Z1", archive], "配布ZIPの内容を読み取れません。")
  .split("\n")
  .filter(Boolean);

const required = [
  "manifest.json",
  "background.js",
  "content/drive-content.js",
  "popup/popup.html",
  "popup/popup.js",
  "options/options.html",
  "options/options.js",
  "lib/filename.js",
  "lib/settings.js"
];
const forbidden = entries.filter(
  (entry) =>
    entry.startsWith("test/") ||
    entry.startsWith("docs/") ||
    entry.startsWith("assets/store/") ||
    entry.startsWith(".git/") ||
    entry.endsWith(".DS_Store")
);
const missing = required.filter((entry) => !entries.includes(entry));

if (missing.length > 0 || forbidden.length > 0) {
  if (missing.length > 0) console.error(`不足ファイル: ${missing.join(", ")}`);
  if (forbidden.length > 0) console.error(`不要ファイル: ${forbidden.join(", ")}`);
  process.exit(1);
}

console.log(`package OK (${entries.length} entries, v${manifest.version})`);

function runUnzip(args, errorMessage) {
  const result = spawnSync("unzip", args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(errorMessage);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  return result.stdout;
}
