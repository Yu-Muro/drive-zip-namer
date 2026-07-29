import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  normalizePresets,
  buildExport,
  parseImport,
  EXPORT_FORMAT
} from "../lib/settings.js";

test("normalizeSettings: 未指定は既定値で埋める", () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test("normalizeSettings: 不正な conflictAction は uniquify に落とす", () => {
  assert.equal(normalizeSettings({ conflictAction: "evil" }).conflictAction, "uniquify");
  assert.equal(normalizeSettings({ conflictAction: "overwrite" }).conflictAction, "overwrite");
});

test("normalizeSettings: 空の defaultTemplate は既定に戻す", () => {
  assert.equal(normalizeSettings({ defaultTemplate: "  " }).defaultTemplate, DEFAULT_SETTINGS.defaultTemplate);
  assert.equal(normalizeSettings({ defaultTemplate: "{date}_{folder}" }).defaultTemplate, "{date}_{folder}");
});

test("normalizeSettings: boolean を強制する", () => {
  const s = normalizeSettings({ promptOnDownload: 0, allowMultiple: 1 });
  assert.equal(s.promptOnDownload, false);
  assert.equal(s.allowMultiple, true);
});

test("normalizePresets: 不正な要素を捨てる", () => {
  const input = [
    { name: "請求書", template: "{date}_請求書" },
    { name: "", template: "x" },
    { name: "x", template: "" },
    null,
    "nope",
    { name: "  写真  ", template: "  {date}_写真  " }
  ];
  assert.deepEqual(normalizePresets(input), [
    { name: "請求書", template: "{date}_請求書" },
    { name: "写真", template: "{date}_写真" }
  ]);
});

test("normalizePresets: 配列以外は空配列", () => {
  assert.deepEqual(normalizePresets(null), []);
  assert.deepEqual(normalizePresets({}), []);
});

test("buildExport: 形式とバージョンを含む", () => {
  const data = buildExport({ saveFolder: "x" }, [{ name: "a", template: "b" }]);
  assert.equal(data.format, EXPORT_FORMAT);
  assert.equal(data.version, 1);
  assert.equal(data.userSettings.saveFolder, "x");
  assert.deepEqual(data.presets, [{ name: "a", template: "b" }]);
});

test("parseImport: 正常な JSON を取り込む", () => {
  const json = JSON.stringify(
    buildExport({ conflictAction: "overwrite" }, [{ name: "a", template: "b" }])
  );
  const result = parseImport(json);
  assert.equal(result.userSettings.conflictAction, "overwrite");
  assert.deepEqual(result.presets, [{ name: "a", template: "b" }]);
});

test("parseImport: 壊れた JSON はエラー", () => {
  assert.throws(() => parseImport("{not json"), /JSON/);
});

test("parseImport: 別形式の format はエラー", () => {
  assert.throws(
    () => parseImport(JSON.stringify({ format: "someone-else", userSettings: {} })),
    /設定ファイル/
  );
});

test("parseImport: format 無しでも寛容に受け入れる", () => {
  const result = parseImport(JSON.stringify({ userSettings: { saveFolder: "y" } }));
  assert.equal(result.userSettings.saveFolder, "y");
  assert.deepEqual(result.presets, []);
});
