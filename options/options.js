import {
  DEFAULT_SETTINGS,
  DEFAULT_PRESETS,
  normalizeSettings,
  normalizePresets,
  buildExport,
  parseImport
} from "../lib/settings.js";
import { inspectTemplate } from "../lib/filename.js";

const defaultTemplateInput = document.getElementById("default-template");
const saveFolderInput = document.getElementById("save-folder");
const promptOnDownloadInput = document.getElementById("prompt-on-download");
const allowMultipleInput = document.getElementById("allow-multiple");
const autoClearInput = document.getElementById("auto-clear");
const saveButton = document.getElementById("save");
const savedNote = document.getElementById("saved-note");
const defaultTemplateError = document.getElementById("default-template-error");

const presetsBody = document.getElementById("presets-body");
const presetNameInput = document.getElementById("preset-name");
const presetTemplateInput = document.getElementById("preset-template");
const presetAddBtn = document.getElementById("preset-add-btn");
const presetError = document.getElementById("preset-error");

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const backupNote = document.getElementById("backup-note");

// メモリ上のプリセット作業コピー。追加/削除のたびに保存する。
let presets = [];
let editingPresetIndex = null;

init();

async function init() {
  const stored = await chrome.storage.local.get(["userSettings", "presets"]);
  const settings = normalizeSettings(stored.userSettings);

  defaultTemplateInput.value = settings.defaultTemplate;
  saveFolderInput.value = settings.saveFolder;
  promptOnDownloadInput.checked = settings.promptOnDownload;
  allowMultipleInput.checked = settings.allowMultiple;
  autoClearInput.checked = settings.autoClearAfterUse;
  const conflictRadio = document.querySelector(
    `input[name="conflict"][value="${settings.conflictAction}"]`
  );
  if (conflictRadio) conflictRadio.checked = true;

  // 初回はプリセット未設定なので例を入れておく
  if (stored.presets === undefined) {
    presets = DEFAULT_PRESETS.slice();
    await chrome.storage.local.set({ presets });
  } else {
    presets = normalizePresets(stored.presets);
  }
  renderPresets();

  saveButton.addEventListener("click", saveSettings);
  defaultTemplateInput.addEventListener("input", () => {
    showFormError(defaultTemplateError, validateTemplate(defaultTemplateInput.value));
  });
  presetAddBtn.addEventListener("click", addPreset);
  presetTemplateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPreset();
  });
  exportBtn.addEventListener("click", exportSettings);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", importSettings);
}

async function saveSettings() {
  const templateError = validateTemplate(defaultTemplateInput.value);
  showFormError(defaultTemplateError, templateError);
  if (templateError) {
    defaultTemplateInput.focus();
    return;
  }
  const conflictAction =
    document.querySelector('input[name="conflict"]:checked')?.value ??
    DEFAULT_SETTINGS.conflictAction;

  const userSettings = normalizeSettings({
    defaultTemplate: defaultTemplateInput.value,
    saveFolder: saveFolderInput.value.trim(),
    conflictAction,
    promptOnDownload: promptOnDownloadInput.checked,
    allowMultiple: allowMultipleInput.checked,
    autoClearAfterUse: autoClearInput.checked
  });

  await chrome.storage.local.set({ userSettings });
  flash(savedNote);
}

// --- プリセット -------------------------------------------------------------

function renderPresets() {
  presetsBody.replaceChildren(
    ...presets.map((preset, i) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = preset.name;

      const tmplTd = document.createElement("td");
      const code = document.createElement("code");
      code.textContent = preset.template;
      tmplTd.appendChild(code);

      const actionsTd = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "編集";
      edit.addEventListener("click", () => editPreset(i));
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.title = "上へ移動";
      up.disabled = i === 0;
      up.addEventListener("click", () => movePreset(i, -1));
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.title = "下へ移動";
      down.disabled = i === presets.length - 1;
      down.addEventListener("click", () => movePreset(i, 1));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "danger";
      del.textContent = "削除";
      del.addEventListener("click", () => removePreset(i));
      actions.append(edit, up, down, del);
      actionsTd.appendChild(actions);

      tr.append(nameTd, tmplTd, actionsTd);
      return tr;
    })
  );
  if (presets.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "empty";
    td.textContent = "プリセットはまだありません。";
    tr.appendChild(td);
    presetsBody.appendChild(tr);
  }
}

async function addPreset() {
  const name = presetNameInput.value.trim();
  const template = presetTemplateInput.value.trim();
  const templateError = validateTemplate(template);
  if (!name || !template || templateError) {
    showFormError(
      presetError,
      templateError || "プリセット名とテンプレートを入力してください。"
    );
    presetNameInput.focus();
    return;
  }
  if (editingPresetIndex == null) {
    presets = normalizePresets([...presets, { name, template }]);
  } else {
    presets = normalizePresets(
      presets.map((preset, index) =>
        index === editingPresetIndex ? { name, template } : preset
      )
    );
  }
  editingPresetIndex = null;
  presetAddBtn.textContent = "追加";
  showFormError(presetError, "");
  presetNameInput.value = "";
  presetTemplateInput.value = "";
  await persistPresets();
  renderPresets();
  presetNameInput.focus();
}

function editPreset(index) {
  const preset = presets[index];
  if (!preset) return;
  editingPresetIndex = index;
  presetNameInput.value = preset.name;
  presetTemplateInput.value = preset.template;
  presetAddBtn.textContent = "更新";
  presetNameInput.focus();
}

async function movePreset(index, direction) {
  const destination = index + direction;
  if (destination < 0 || destination >= presets.length) return;
  [presets[index], presets[destination]] = [presets[destination], presets[index]];
  await persistPresets();
  renderPresets();
}

async function removePreset(index) {
  presets = presets.filter((_, i) => i !== index);
  await persistPresets();
  renderPresets();
}

async function persistPresets() {
  await chrome.storage.local.set({ presets });
}

// --- エクスポート / インポート ----------------------------------------------

async function exportSettings() {
  const { userSettings } = await chrome.storage.local.get("userSettings");
  const data = buildExport(userSettings, presets);
  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "drive-zip-namer-settings.json";
  a.click();
  URL.revokeObjectURL(url);

  showBackupNote("設定をエクスポートしました。", false);
}

function importSettings(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { userSettings, presets: importedPresets } = parseImport(
        String(reader.result)
      );
      await chrome.storage.local.set({ userSettings, presets: importedPresets });

      // 画面を読み込み直した状態に反映
      presets = importedPresets;
      applySettingsToForm(userSettings);
      renderPresets();
      showBackupNote("設定をインポートしました。", false);
    } catch (error) {
      showBackupNote(`インポートに失敗しました: ${error.message}`, true);
    } finally {
      importFile.value = "";
    }
  };
  reader.readAsText(file);
}

function applySettingsToForm(settings) {
  defaultTemplateInput.value = settings.defaultTemplate;
  saveFolderInput.value = settings.saveFolder;
  promptOnDownloadInput.checked = settings.promptOnDownload;
  allowMultipleInput.checked = settings.allowMultiple;
  autoClearInput.checked = settings.autoClearAfterUse;
  const conflictRadio = document.querySelector(
    `input[name="conflict"][value="${settings.conflictAction}"]`
  );
  if (conflictRadio) conflictRadio.checked = true;
}

// --- 小物 -------------------------------------------------------------------

function flash(el) {
  el.hidden = false;
  setTimeout(() => {
    el.hidden = true;
  }, 2000);
}

function showBackupNote(message, isError) {
  backupNote.textContent = message;
  backupNote.classList.toggle("error", isError);
  backupNote.hidden = false;
}

function validateTemplate(template) {
  const value = String(template ?? "").trim();
  if (!value) return "テンプレートを入力してください。";
  const inspected = inspectTemplate(value, {
    now: new Date(),
    project: "project",
    folder: "folder",
    count: 1
  });
  if (inspected.malformed) return "変数の波括弧が閉じられていません。";
  return inspected.unknown.length > 0
    ? `未対応の変数です: ${inspected.unknown.map((name) => `{${name}}`).join(" ")}`
    : "";
}

function showFormError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}
