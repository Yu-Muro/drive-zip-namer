import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  normalizePresets,
  normalizeNameHistory,
  migrateStorageData,
  buildExport,
  parseImport,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  STORAGE_SCHEMA_VERSION
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

test("normalizeSettings: 不正なbooleanは安全な既定値へ戻す", () => {
  const s = normalizeSettings({ promptOnDownload: 0, allowMultiple: 1 });
  assert.equal(s.promptOnDownload, true);
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
  assert.equal(data.version, EXPORT_VERSION);
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

test("parseImport: format や version が無いファイルは拒否する", () => {
  assert.throws(
    () => parseImport(JSON.stringify({ userSettings: {}, presets: [] })),
    /設定ファイル/
  );
});

test("parseImport: v0.3のversion 1エクスポートを移行できる", () => {
  const result = parseImport(
    JSON.stringify({
      format: EXPORT_FORMAT,
      version: 1,
      userSettings: { saveFolder: "legacy" },
      presets: []
    })
  );
  assert.equal(result.userSettings.saveFolder, "legacy");
});

test("parseImport: 将来バージョンと不正な型を拒否する", () => {
  assert.throws(
    () =>
      parseImport(
        JSON.stringify({
          format: EXPORT_FORMAT,
          version: 999,
          userSettings: {},
          presets: []
        })
      ),
    /未対応/
  );
  assert.throws(
    () =>
      parseImport(
        JSON.stringify({
          format: EXPORT_FORMAT,
          version: EXPORT_VERSION,
          userSettings: { promptOnDownload: "false" },
          presets: []
        })
      ),
    /promptOnDownload/
  );
});

test("migrateStorageData: v0.3の保存値をv1へ正規化する", () => {
  const migrated = migrateStorageData({
    userSettings: { promptOnDownload: false },
    presets: [],
    nameHistory: [" a ", 42, "a", "b"],
    lastProject: " Project "
  });
  assert.equal(migrated.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.equal(migrated.userSettings.promptOnDownload, false);
  assert.deepEqual(migrated.presets, []);
  assert.deepEqual(migrated.nameHistory, ["a", "b"]);
  assert.equal(migrated.lastProject, "Project");
});

test("normalizeNameHistory: 不正値を除外し重複を削除する", () => {
  assert.deepEqual(normalizeNameHistory([" x ", null, "x", "y"]), ["x", "y"]);
});
