import { readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRECTORIES = new Set([".git", "dist", "node_modules"]);
const files = collectJavaScriptFiles(ROOT);
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    failures.push(`${relative(ROOT, file)}\n${result.stderr || result.stdout}`);
  }
}

if (failures.length > 0) {
  console.error(`JavaScript構文検査に失敗しました:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(`JavaScript syntax OK (${files.length} files)`);

function collectJavaScriptFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        result.push(...collectJavaScriptFiles(join(directory, entry.name)));
      }
      continue;
    }
    if ([".js", ".mjs"].includes(extname(entry.name))) {
      result.push(join(directory, entry.name));
    }
  }
  return result.sort();
}
