// 設定・プリセットの既定値とバリデーション（純粋関数）。
// background / popup / options / エクスポート・インポートで共用する。

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
  { name: "請求書", template: "{date}_請求書" },
  { name: "納品データ", template: "{date}_{project}_納品データ" },
  { name: "写真素材", template: "{date}_写真素材" }
];

const CONFLICT_ACTIONS = new Set(["uniquify", "overwrite", "prompt"]);

/**
 * 保存済み userSettings を既定値とマージし、型を正す。
 */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    saveFolder: typeof s.saveFolder === "string" ? s.saveFolder : "",
    conflictAction: CONFLICT_ACTIONS.has(s.conflictAction)
      ? s.conflictAction
      : "uniquify",
    autoClearAfterUse: Boolean(s.autoClearAfterUse),
    allowMultiple: Boolean(s.allowMultiple),
    promptOnDownload: Boolean(s.promptOnDownload),
    defaultTemplate:
      typeof s.defaultTemplate === "string" && s.defaultTemplate.trim()
        ? s.defaultTemplate
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
      return { name, template };
    })
    .filter(Boolean)
    .slice(0, 50);
}

export const EXPORT_FORMAT = "drive-zip-namer/settings";
export const EXPORT_VERSION = 1;

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
    throw new Error("JSON として読み取れませんでした。");
  }
  if (!data || typeof data !== "object") {
    throw new Error("設定ファイルの形式が正しくありません。");
  }
  if (data.format && data.format !== EXPORT_FORMAT) {
    throw new Error("この拡張機能の設定ファイルではありません。");
  }
  return {
    userSettings: normalizeSettings(data.userSettings),
    presets: normalizePresets(data.presets)
  };
}
