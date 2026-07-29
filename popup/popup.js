import { sanitizeZipFilename, applyTemplate } from "../lib/filename.js";

// 予約の有効期限（ポップアップから設定してからDriveでダウンロードするまでの猶予）
const PENDING_TTL_MS = 5 * 60 * 1000;
const HISTORY_MAX = 5;

const presetsSection = document.getElementById("presets-section");
const presetsEl = document.getElementById("presets");
const filenameInput = document.getElementById("filename");
const projectInput = document.getElementById("project");
const previewEl = document.getElementById("preview");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("status-text");
const clearButton = document.getElementById("clear");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history");
const optionsButton = document.getElementById("open-options");

init();

async function init() {
  const { pendingRename, nameHistory, presets, lastProject } =
    await chrome.storage.local.get([
      "pendingRename",
      "nameHistory",
      "presets",
      "lastProject"
    ]);

  projectInput.value = lastProject ?? "";
  renderStatus(pendingRename);
  renderHistory(nameHistory ?? []);
  renderPresets(presets ?? []);

  filenameInput.addEventListener("input", renderPreview);
  projectInput.addEventListener("input", renderPreview);
  filenameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
  saveButton.addEventListener("click", save);
  clearButton.addEventListener("click", clearPending);
  optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

  renderPreview();
}

function currentVars() {
  return { now: new Date(), project: projectInput.value.trim() };
}

function renderPreview() {
  const raw = filenameInput.value;
  if (!raw.trim()) {
    previewEl.textContent = "";
    return;
  }
  // {folder}/{count} はダウンロード時に展開されるため、ここでは残る
  previewEl.textContent = `→ ${sanitizeZipFilename(applyTemplate(raw, currentVars()))}`;
}

async function save() {
  const raw = filenameInput.value;
  if (!raw.trim()) {
    filenameInput.focus();
    return;
  }

  const now = Date.now();
  const project = projectInput.value.trim();

  // 生のテンプレートを保存し、展開はダウンロード時に行う
  // （{folder}/{count} を実際のDrive文脈で埋められるようにするため）
  const pendingRename = {
    enabled: true,
    template: raw,
    project,
    createdAt: now,
    expiresAt: now + PENDING_TTL_MS,
    sequence: 0,
    source: "popup"
  };

  const { nameHistory } = await chrome.storage.local.get("nameHistory");
  const history = [raw, ...(nameHistory ?? []).filter((n) => n !== raw)].slice(
    0,
    HISTORY_MAX
  );

  await chrome.storage.local.set({
    pendingRename,
    nameHistory: history,
    lastProject: project
  });
  window.close();
}

async function clearPending() {
  await chrome.storage.local.remove("pendingRename");
  renderStatus(null);
}

function renderStatus(pendingRename) {
  const active = pendingRename?.enabled && Date.now() < pendingRename.expiresAt;

  statusEl.hidden = !active;
  if (active) {
    const remainMin = Math.ceil((pendingRename.expiresAt - Date.now()) / 60000);
    const template = pendingRename.template ?? pendingRename.filename ?? "";
    const preview = sanitizeZipFilename(
      applyTemplate(template, {
        now: new Date(pendingRename.createdAt ?? Date.now()),
        project: pendingRename.project
      })
    );
    statusTextEl.textContent = `予約中: ${preview}（あと約${remainMin}分有効）`;
  }
}

function renderPresets(presets) {
  presetsSection.hidden = presets.length === 0;
  presetsEl.replaceChildren(
    ...presets.map((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = preset.name;
      btn.title = preset.template;
      btn.addEventListener("click", () => {
        filenameInput.value = preset.template;
        filenameInput.focus();
        renderPreview();
      });
      return btn;
    })
  );
}

function renderHistory(history) {
  historySection.hidden = history.length === 0;
  historyList.replaceChildren(
    ...history.map((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      li.title = "クリックして入力欄にセット";
      li.addEventListener("click", () => {
        filenameInput.value = name;
        filenameInput.focus();
        renderPreview();
      });
      return li;
    })
  );
}
