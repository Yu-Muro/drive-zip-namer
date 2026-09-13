import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const expected = new Map([
  ["assets/icon-16.png", [16, 16]],
  ["assets/icon-48.png", [48, 48]],
  ["assets/icon-128.png", [128, 128]],
  ["assets/store/store-1.png", [1280, 800]],
  ["assets/store/store-2.png", [1280, 800]],
  ["assets/store/store-3.png", [1280, 800]],
  ["assets/store/promo-small-tile.png", [440, 280]]
]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const errors = [];

for (const [path, [expectedWidth, expectedHeight]] of expected) {
  try {
    const data = readFileSync(join(ROOT, path));
    if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
      errors.push(`${path}: PNG形式ではありません`);
      continue;
    }
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width !== expectedWidth || height !== expectedHeight) {
      errors.push(
        `${path}: ${width}x${height}（期待値 ${expectedWidth}x${expectedHeight}）`
      );
    }
  } catch (error) {
    errors.push(`${path}: 読み取れません (${error.message})`);
  }
}

if (errors.length > 0) {
  console.error(`画像アセット検査に失敗しました:\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`image assets OK (${expected.size} files)`);
