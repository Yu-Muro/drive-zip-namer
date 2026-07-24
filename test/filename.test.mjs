import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeZipFilename,
  applyTemplate,
  buildSequencedFilename,
  withSaveFolder
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

test("applyTemplate: {date} {time} {datetime} を展開する", () => {
  const now = new Date(2026, 6, 24, 14, 30);
  assert.equal(applyTemplate("{date}_納品", now), "2026-07-24_納品");
  assert.equal(applyTemplate("{time}", now), "1430");
  assert.equal(applyTemplate("{datetime}", now), "2026-07-24_1430");
});

test("applyTemplate: 未知の変数はそのまま残す", () => {
  const now = new Date(2026, 6, 24, 14, 30);
  assert.equal(applyTemplate("{folder}_x", now), "{folder}_x");
});

test("buildSequencedFilename: 1個目はそのまま、2個目以降は _partN", () => {
  assert.equal(buildSequencedFilename("納品データ.zip", 1), "納品データ.zip");
  assert.equal(buildSequencedFilename("納品データ.zip", 2), "納品データ_part2.zip");
  assert.equal(buildSequencedFilename("納品データ.zip", 3), "納品データ_part3.zip");
});

test("withSaveFolder: サブフォルダを付ける", () => {
  assert.equal(withSaveFolder("a.zip", "GoogleDrive"), "GoogleDrive/a.zip");
  assert.equal(withSaveFolder("a.zip", ""), "a.zip");
  assert.equal(withSaveFolder("a.zip", null), "a.zip");
});

test("withSaveFolder: フォルダ名の危険な文字も安全化する", () => {
  assert.equal(withSaveFolder("a.zip", "..\\evil"), "_evil/a.zip");
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
