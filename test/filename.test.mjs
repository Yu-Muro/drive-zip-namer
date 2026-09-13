import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeZipFilename,
  applyTemplate,
  inspectTemplate,
  buildSequencedFilename,
  withSaveFolder,
  MAX_FILENAME_BYTES
} from "../lib/filename.js";
import { isGoogleDriveZip } from "../lib/drive-detection.js";

test("sanitizeZipFilename: 通常の名前に .zip を付ける", () => {
  assert.equal(sanitizeZipFilename("請求書一式"), "請求書一式.zip");
});

test("sanitizeZipFilename: 既に .zip が付いていても二重にしない", () => {
  assert.equal(sanitizeZipFilename("data.zip"), "data.zip");
  assert.equal(sanitizeZipFilename("data.ZIP"), "data.zip");
});

test("sanitizeZipFilename: 禁止文字を _ に置換する", () => {
  assert.equal(sanitizeZipFilename('a\\b/c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j.zip");
});

test("sanitizeZipFilename: 空入力はフォールバック名になる", () => {
  assert.equal(sanitizeZipFilename(""), "google-drive-download.zip");
  assert.equal(sanitizeZipFilename("   "), "google-drive-download.zip");
  assert.equal(sanitizeZipFilename(null), "google-drive-download.zip");
});

test("sanitizeZipFilename: 末尾のドットと空白を除去する", () => {
  assert.equal(sanitizeZipFilename("report. . "), "report.zip");
});

test("sanitizeZipFilename: 連続空白を1つにまとめる", () => {
  assert.equal(sanitizeZipFilename("a   b"), "a b.zip");
});

test("sanitizeZipFilename: Windows予約名と制御文字を安全化する", () => {
  assert.equal(sanitizeZipFilename("CON"), "_CON.zip");
  assert.equal(sanitizeZipFilename("nul.txt"), "_nul.txt.zip");
  assert.equal(sanitizeZipFilename("report\u007f\u0085name"), "reportname.zip");
});

test("sanitizeZipFilename: UnicodeをNFCへ正規化して最大長に収める", () => {
  assert.equal(sanitizeZipFilename("e\u0301"), "é.zip");
  const result = sanitizeZipFilename("あ".repeat(200));
  assert.ok(new TextEncoder().encode(result).length <= MAX_FILENAME_BYTES);
  assert.ok(result.endsWith(".zip"));
});

test("applyTemplate: {date} {time} {datetime} を展開する", () => {
  const now = new Date(2026, 6, 24, 14, 30);
  assert.equal(applyTemplate("{date}_納品", now), "2026-07-24_納品");
  assert.equal(applyTemplate("{time}", now), "1430");
  assert.equal(applyTemplate("{datetime}", now), "2026-07-24_1430");
});

test("applyTemplate: 値が無い {folder}/{count}/{project} はそのまま残す", () => {
  const now = new Date(2026, 6, 24, 14, 30);
  assert.equal(applyTemplate("{folder}_x", now), "{folder}_x");
  assert.equal(applyTemplate("{count}_{project}", now), "{count}_{project}");
});

test("applyTemplate: vars で {project}/{folder}/{count} を展開する", () => {
  const now = new Date(2026, 6, 24, 14, 30);
  assert.equal(
    applyTemplate("{date}_{project}_{folder}_{count}files", {
      now,
      project: "Canna",
      folder: "請求書",
      count: 12
    }),
    "2026-07-24_Canna_請求書_12files"
  );
});

test("applyTemplate: count が 0 でも展開する", () => {
  assert.equal(applyTemplate("{count}", { count: 0 }).startsWith("0"), true);
});

test("applyTemplate: 第2引数に Date を渡す後方互換が保たれる", () => {
  const now = new Date(2026, 6, 24, 14, 30);
  assert.equal(applyTemplate("{datetime}", now), "2026-07-24_1430");
});

test("inspectTemplate: 未知変数と未解決変数を区別する", () => {
  const result = inspectTemplate("{date}_{folder}_{unknown}", {
    now: new Date(2026, 6, 24)
  });
  assert.deepEqual(result.unknown, ["unknown"]);
  assert.deepEqual(result.unresolved, ["folder"]);
  assert.equal(result.malformed, false);
  assert.equal(inspectTemplate("bad_{name").malformed, true);
  assert.equal(inspectTemplate("bad_{}").malformed, true);
});

test("buildSequencedFilename: 1個目はそのまま、2個目以降は _partN", () => {
  assert.equal(buildSequencedFilename("納品データ.zip", 1), "納品データ.zip");
  assert.equal(buildSequencedFilename("納品データ.zip", 2), "納品データ_part2.zip");
  assert.equal(buildSequencedFilename("納品データ.zip", 3), "納品データ_part3.zip");
});

test("buildSequencedFilename: 長い名前でもpart番号と拡張子を維持する", () => {
  const result = buildSequencedFilename(`${"あ".repeat(200)}.zip`, 12);
  assert.ok(result.endsWith("_part12.zip"));
  assert.ok(new TextEncoder().encode(result).length <= MAX_FILENAME_BYTES);
});

test("withSaveFolder: サブフォルダを付ける", () => {
  assert.equal(withSaveFolder("a.zip", "GoogleDrive"), "GoogleDrive/a.zip");
  assert.equal(withSaveFolder("a.zip", ""), "a.zip");
  assert.equal(withSaveFolder("a.zip", null), "a.zip");
});

test("withSaveFolder: フォルダ名の危険な文字も安全化する", () => {
  assert.equal(withSaveFolder("a.zip", "..\\evil"), "_evil/a.zip");
  assert.equal(withSaveFolder("a.zip", "CON"), "_CON/a.zip");
});

test("isGoogleDriveZip: drive.google.com のzipを検知する", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://drive.google.com/uc?export=download",
      filename: "drive-download-20260724.zip"
    }),
    true
  );
});

test("isGoogleDriveZip: googleusercontent.com 配信も検知する", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://drive.google.com/drive/folders/x",
      finalUrl: "https://doc-00-xx.drive.usercontent.google.com/download",
      filename: "files.zip"
    }),
    true
  );
});

test("isGoogleDriveZip: Google管理ドメインのサブドメインを検知する", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://doc-00-xx.googleusercontent.com/download",
      filename: "files.zip"
    }),
    true
  );
});

test("isGoogleDriveZip: URLのクエリにDrive URLが含まれるだけなら対象外", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://example.com/download?next=https://drive.google.com/file",
      filename: "files.zip"
    }),
    false
  );
});

test("isGoogleDriveZip: 末尾が似ている別ドメインは対象外", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://notgoogleusercontent.com/files.zip",
      filename: "files.zip"
    }),
    false
  );
});

test("isGoogleDriveZip: 他サイトのzipは対象外", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://example.com/files.zip",
      filename: "files.zip"
    }),
    false
  );
});

test("isGoogleDriveZip: Drive由来でもzip以外は対象外", () => {
  assert.equal(
    isGoogleDriveZip({
      url: "https://drive.google.com/uc?export=download",
      filename: "report.pdf",
      mime: "application/pdf"
    }),
    false
  );
});
