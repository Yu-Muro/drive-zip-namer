// manifest.json の妥当性と、package.json とのバージョン整合を検証する。
// CI と、ローカルの `npm run validate` から使う。失敗時は非0で終了。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
  } catch (e) {
    errors.push(`${rel} を JSON として読めません: ${e.message}`);
    return null;
  }
}

const manifest = readJson("manifest.json");
const pkg = readJson("package.json");

if (manifest) {
  if (manifest.manifest_version !== 3) {
    errors.push(`manifest_version は 3 である必要があります（現在: ${manifest.manifest_version}）`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
    errors.push(`manifest.version が semver ではありません（現在: ${manifest.version}）`);
  }
  if (!manifest.name) errors.push("manifest.name が空です");
  if (!manifest.background?.service_worker) {
    errors.push("background.service_worker が未設定です");
  }

  // manifest が参照するファイルが実在するか
  const referenced = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.content_scripts ?? []).flatMap((cs) => cs.js ?? [])
  ].filter(Boolean);

  for (const rel of referenced) {
    try {
      readFileSync(join(ROOT, rel));
    } catch {
      errors.push(`manifest が参照する ${rel} が存在しません`);
    }
  }
}

if (manifest && pkg && manifest.version !== pkg.version) {
  errors.push(
    `バージョン不一致: manifest.json=${manifest.version} / package.json=${pkg.version}`
  );
}

if (errors.length > 0) {
  console.error("manifest 検証に失敗しました:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`manifest OK (v${manifest.version}, MV${manifest.manifest_version})`);
