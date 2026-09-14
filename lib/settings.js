// 設定・プリセットの既定値とバリデーション（純粋関数）。
// background / popup / options / エクスポート・インポートで共用する。

import { t } from "./i18n.js";

export const DEFAULT_SETTINGS = {
  saveFolder: "",
  conflictAction: "uniquify",
  autoClearAfterUse: true,
  allowMultiple: true,
  promptOnDownload: true,
  // モーダル/予約のプレフィルに使う既定テンプレート
  defaultTemplate: "{date}_"
};

// 初回に用意しておく案件別プリセットの例
export const DEFAULT_PRESETS = [
  { name: t("presetInvoice"), template: `{date}_${t("presetInvoice")}` },
  { name: t("presetDelivery"), template: `{date}_{project}_${t("presetDelivery")}` },
  { name: t("presetPhotos"), template: `{date}_${t("presetPhotos")}` }
];

const CONFLICT_ACTIONS = new Set(["uniquify", "overwrite", "prompt"]);
export const STORAGE_SCHEMA_VERSION = 1;
export const MAX_PRESETS = 50;
export const MAX_HISTORY = 5;
export const MAX_TEMPLATE_LENGTH = 500;
export const MAX_PRESET_NAME_LENGTH = 80;
export const MAX_PROJECT_LENGTH = 120;
export const MAX_SAVE_FOLDER_LENGTH = 180;

/**
 * 保存済み userSettings を既定値とマージし、型を正す。
 */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    saveFolder:
      typeof s.saveFolder === "string"
        ? s.saveFolder.slice(0, MAX_SAVE_FOLDER_LENGTH)
        : "",
    conflictAction: CONFLICT_ACTIONS.has(s.conflictAction)
      ? s.conflictAction
      : "uniquify",
    autoClearAfterUse:
      typeof s.autoClearAfterUse === "boolean"
        ? s.autoClearAfterUse
        : DEFAULT_SETTINGS.autoClearAfterUse,
    allowMultiple:
      typeof s.allowMultiple === "boolean"
        ? s.allowMultiple
        : DEFAULT_SETTINGS.allowMultiple,
    promptOnDownload:
      typeof s.promptOnDownload === "boolean"
        ? s.promptOnDownload
        : DEFAULT_SETTINGS.promptOnDownload,
    defaultTemplate:
      typeof s.defaultTemplate === "string" && s.defaultTemplate.trim()
        ? s.defaultTemplate.slice(0, MAX_TEMPLATE_LENGTH)
        : DEFAULT_SETTINGS.defaultTemplate
  };
}

/**
 * 任意の入力を、安全なプリセット配列（{name, template}[]）に整える。
 * 不正な要素は捨てる。
 */
export function normalizePresets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const name = typeof p.name === "string" ? p.name.trim() : "";
      const template = typeof p.template === "string" ? p.template.trim() : "";
      if (!name || !template) return null;
      return {
        name: name.slice(0, MAX_PRESET_NAME_LENGTH),
        template: template.slice(0, MAX_TEMPLATE_LENGTH)
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PRESETS);
}

export function normalizeNameHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((item) => typeof item === "string")
        .map((item) => item.trim().slice(0, MAX_TEMPLATE_LENGTH))
        .filter(Boolean)
    )
  ].slice(0, MAX_HISTORY);
}

/** v0.3以前のローカル保存値を、v1の保存スキーマへ移行する。 */
export function migrateStorageData(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    userSettings: normalizeSettings(source.userSettings),
    presets:
      source.presets === undefined
        ? DEFAULT_PRESETS.slice()
        : normalizePresets(source.presets),
    nameHistory: normalizeNameHistory(source.nameHistory),
    lastProject:
      typeof source.lastProject === "string"
        ? source.lastProject.trim().slice(0, MAX_PROJECT_LENGTH)
        : ""
  };
}

export const EXPORT_FORMAT = "drive-zip-namer/settings";
export const EXPORT_VERSION = 2;

/**
 * エクスポート用のプレーンオブジェクトを作る。
 */
export function buildExport(settings, presets) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    userSettings: normalizeSettings(settings),
    presets: normalizePresets(presets)
  };
}

/**
 * インポートされた JSON テキストを検証して {userSettings, presets} を返す。
 * 不正なら Error を投げる。
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t("invalidJson"));
  }
  if (!data || typeof data !== "object") {
    throw new Error(t("invalidSettingsFormat"));
  }
  if (data.format !== EXPORT_FORMAT) {
    throw new Error(t("wrongSettingsFile"));
  }
  if (data.version !== 1 && data.version !== EXPORT_VERSION) {
    throw new Error(t("unsupportedSettingsVersion", String(data.version)));
  }
  validateImportShape(data);
  return {
    userSettings: normalizeSettings(data.userSettings),
    presets: normalizePresets(data.presets)
  };
}

function validateImportShape(data) {
  if (!data.userSettings || typeof data.userSettings !== "object") {
    throw new Error(t("settingsMissing"));
  }
  if (!Array.isArray(data.presets)) {
    throw new Error(t("invalidPresetsFormat"));
  }
  if (data.presets.length > MAX_PRESETS) {
    throw new Error(t("tooManyPresets", MAX_PRESETS));
  }

  const settings = data.userSettings;
  for (const key of ["saveFolder", "defaultTemplate"]) {
    if (key in settings && typeof settings[key] !== "string") {
      throw new Error(t("invalidSettingType", key));
    }
  }
  for (const key of ["autoClearAfterUse", "allowMultiple", "promptOnDownload"]) {
    if (key in settings && typeof settings[key] !== "boolean") {
      throw new Error(t("invalidSettingType", key));
    }
  }
  if (
    "conflictAction" in settings &&
    !CONFLICT_ACTIONS.has(settings.conflictAction)
  ) {
    throw new Error(t("invalidConflictAction"));
  }
  if ((settings.defaultTemplate?.length ?? 0) > MAX_TEMPLATE_LENGTH) {
    throw new Error(t("defaultTemplateTooLong"));
  }
  if ((settings.saveFolder?.length ?? 0) > MAX_SAVE_FOLDER_LENGTH) {
    throw new Error(t("saveFolderTooLong"));
  }

  for (const preset of data.presets) {
    if (
      !preset ||
      typeof preset !== "object" ||
      typeof preset.name !== "string" ||
      !preset.name.trim() ||
      preset.name.length > MAX_PRESET_NAME_LENGTH ||
      typeof preset.template !== "string" ||
      !preset.template.trim() ||
      preset.template.length > MAX_TEMPLATE_LENGTH
    ) {
      throw new Error(t("invalidPreset"));
    }
  }
}
