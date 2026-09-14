const FALLBACK_MESSAGES = {
  presetInvoice: "請求書",
  presetDelivery: "納品データ",
  presetPhotos: "写真素材",
  invalidJson: "JSON として読み取れませんでした。",
  invalidSettingsFormat: "設定ファイルの形式が正しくありません。",
  wrongSettingsFile: "この拡張機能の設定ファイルではありません。",
  unsupportedSettingsVersion: "未対応の設定ファイルバージョンです: $1",
  settingsMissing: "設定項目が見つかりません。",
  invalidPresetsFormat: "プリセットの形式が正しくありません。",
  tooManyPresets: "プリセットは$1件までです。",
  invalidSettingType: "$1 の形式が正しくありません。",
  invalidConflictAction: "conflictAction の値が正しくありません。",
  defaultTemplateTooLong: "既定テンプレートが長すぎます。",
  saveFolderTooLong: "保存先サブフォルダ名が長すぎます。",
  invalidPreset: "プリセットに不正な項目があります。",
  unmatchedBrace: "変数の波括弧が閉じられていません。",
  unsupportedVariables: "未対応の変数です: $1",
  reservationActive: "予約中: $1（あと約$2分有効）",
  historyItemTitle: "クリックして入力欄にセット",
  renamed: "名前を変更しました。",
  expansionFailed: "テンプレートを自動展開できず、名前入力も無効なため元の名前を使用しました。",
  promptCancelled: "名前入力がキャンセルまたは中断されました。",
  driveTabNotFound: "対象のDriveタブを安全に特定できなかったため、元の名前を使用しました。",
  renameFailed: "名前の変更中にエラーが発生しました。",
  edit: "編集",
  moveUp: "上へ移動",
  moveDown: "下へ移動",
  delete: "削除",
  noPresets: "プリセットはまだありません。",
  presetRequired: "プリセット名とテンプレートを入力してください。",
  add: "追加",
  update: "更新",
  exported: "設定をエクスポートしました。",
  imported: "設定をインポートしました。",
  importFailed: "インポートに失敗しました: $1",
  templateRequired: "テンプレートを入力してください。"
};

export function t(key, substitutions = []) {
  const values = (Array.isArray(substitutions) ? substitutions : [substitutions]).map(
    String
  );
  const translated = globalThis.chrome?.i18n?.getMessage?.(key, values);
  const template = translated || FALLBACK_MESSAGES[key] || key;
  return values.reduce(
    (message, value, index) => message.replaceAll(`$${index + 1}`, String(value)),
    template
  );
}

export function getUiLanguage() {
  return globalThis.chrome?.i18n?.getUILanguage?.() || "ja";
}

export function localizeDocument(root = document) {
  root.documentElement.lang = getUiLanguage().replace("_", "-");
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const element of root.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }
  for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
}
