// アイコン生成スクリプト（依存パッケージなし・Node標準のみ）
// 512pxで描画してから各サイズへボックス縮小し、assets/ にPNGを書き出す。
// 使い方: node scripts/generate-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "assets");
const SIZES = [16, 48, 128];
const S = 512; // 描画キャンバスサイズ

// ---- 描画 ----------------------------------------------------------------

// RGBA float配列
const canvas = new Float64Array(S * S * 4);

function setPixel(x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const srcA = a;
  const dstA = canvas[i + 3];
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  canvas[i] = (r * srcA + canvas[i] * dstA * (1 - srcA)) / outA;
  canvas[i + 1] = (g * srcA + canvas[i + 1] * dstA * (1 - srcA)) / outA;
  canvas[i + 2] = (b * srcA + canvas[i + 2] * dstA * (1 - srcA)) / outA;
  canvas[i + 3] = outA;
}

function fill(test, color) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cov = test(x + 0.5, y + 0.5);
      if (cov > 0) setPixel(x, y, [color[0], color[1], color[2], color[3] * cov]);
    }
  }
}

// 角丸長方形のカバレッジ（境界1pxをなめらかに）
function roundedRect(cx, cy, w, h, r) {
  return (x, y) => {
    const dx = Math.abs(x - cx) - (w / 2 - r);
    const dy = Math.abs(y - cy) - (h / 2 - r);
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    const dist = Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
    return Math.min(Math.max(0.5 - dist, 0), 1);
  };
}

function circle(cx, cy, r) {
  return (x, y) => {
    const dist = Math.hypot(x - cx, y - cy) - r;
    return Math.min(Math.max(0.5 - dist, 0), 1);
  };
}

const BLUE = [26 / 255, 115 / 255, 232 / 255, 1];
const BLUE_DARK = [23 / 255, 101 / 255, 204 / 255, 1];
const WHITE = [1, 1, 1, 1];

// 背景: 青の角丸スクエア
fill(roundedRect(S / 2, S / 2, 460, 460, 96), BLUE);

// フォルダ: 白いタブ付きフォルダ
fill(roundedRect(200, 168, 152, 48, 16), WHITE); // タブ
fill(roundedRect(S / 2, 296, 328, 224, 28), WHITE); // 本体

// ジッパー: フォルダ中央を縦に走る青いライン + 互い違いの歯
fill(roundedRect(S / 2, 296, 20, 224, 4), BLUE_DARK);
for (let i = 0; i < 5; i++) {
  const y = 210 + i * 44;
  fill(roundedRect(S / 2 - 17, y, 22, 16, 4), BLUE_DARK);
  fill(roundedRect(S / 2 + 17, y + 22, 22, 16, 4), BLUE_DARK);
}

// ジッパーの引き手
fill(circle(S / 2, 428, 26), BLUE_DARK);
fill(circle(S / 2, 428, 12), WHITE);

// ---- 縮小とPNG書き出し ----------------------------------------------------

function downsample(size) {
  const block = S / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let by = 0; by < block; by++) {
        for (let bx = 0; bx < block; bx++) {
          const i = ((y * block + by) * S + (x * block + bx)) * 4;
          const pa = canvas[i + 3];
          r += canvas[i] * pa;
          g += canvas[i + 1] * pa;
          b += canvas[i + 2] * pa;
          a += pa;
        }
      }
      const n = block * block;
      const o = (y * size + x) * 4;
      out[o] = a > 0 ? Math.round((r / a) * 255) : 0;
      out[o + 1] = a > 0 ? Math.round((g / a) * 255) : 0;
      out[o + 2] = a > 0 ? Math.round((b / a) * 255) : 0;
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(path, pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // フィルタなし（各行先頭に0）
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writePng(join(OUT_DIR, `icon-${size}.png`), downsample(size), size);
}
