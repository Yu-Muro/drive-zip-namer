import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tag = process.argv[2];

if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  fail("リリースタグは v1.2.3 形式で指定してください。");
}

const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const tagVersion = tag.slice(1);

if (manifest.version !== packageJson.version) {
  fail(
    `manifest.json (${manifest.version}) と package.json (${packageJson.version}) のバージョンが一致しません。`
  );
}

if (tagVersion !== manifest.version) {
  fail(
    `タグ (${tagVersion}) と拡張機能 (${manifest.version}) のバージョンが一致しません。`
  );
}

console.log(`release version OK (v${tagVersion})`);

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
