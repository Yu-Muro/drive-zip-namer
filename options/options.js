import {
  DEFAULT_SETTINGS,
  DEFAULT_PRESETS,
  normalizeSettings,
  normalizePresets,
  buildExport,
  parseImport
} from "../lib/settings.js";

const defaultTemplateInput = document.getElementById("default-template");
const saveFolderInput = document.getElementById("save-folder");
const promptOnDownloadInput = document.getElementById("prompt-on-download");
const allowMultipleInput = document.getElementById("allow-multiple");
const autoClearInput = document.getElementById("auto-clear");
const saveButton = document.getElementById("save");
const savedNote = document.getElementById("saved-note");

const presetsBody = document.getElementById("presets-body");
const presetNameInput = document.getElementById("preset-name");
const presetTemplateInput = document.getElementById("preset-template");
const presetAddBtn = document.getElementById("preset-add-btn");

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const backupNote = document.getElementById("backup-note");

// メモリ上のプリセット作業コピー。追加/削除のたびに保存する。
let presets = [];

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
  presets = stored.presets === undefined
    ? DEFAULT_PRESETS.slice()
    : normalizePresets(stored.presets);
  renderPresets();

  saveButton.addEventListener("click", saveSettings);
  presetAddBtn.addEventListener("click", addPreset);
  presetTemplateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addPreset();
  });
  exportBtn.addEventListener("click", exportSettings);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", importSettings);
}

async function saveSettings() {
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

      const delTd = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "link-danger";
      del.textContent = "削除";
      del.addEventListener("click", () => removePreset(i));
      delTd.appendChild(del);

      tr.append(nameTd, tmplTd, delTd);
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
  if (!name || !template) {
    presetNameInput.focus();
    return;
  }
  presets = normalizePresets([...presets, { name, template }]);
  presetNameInput.value = "";
  presetTemplateInput.value = "";
  await persistPresets();
  renderPresets();
  presetNameInput.focus();
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
