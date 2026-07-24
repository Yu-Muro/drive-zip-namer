import { sanitizeZipFilename, applyTemplate } from "../lib/filename.js";

// 予約の有効期限（ポップアップから設定してからDriveでダウンロードするまでの猶予）
const PENDING_TTL_MS = 5 * 60 * 1000;
const HISTORY_MAX = 5;

const filenameInput = document.getElementById("filename");
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
  const { pendingRename, nameHistory } = await chrome.storage.local.get([
    "pendingRename",
    "nameHistory"
  ]);

  renderStatus(pendingRename);
  renderHistory(nameHistory ?? []);

  filenameInput.addEventListener("input", renderPreview);
  filenameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
  saveButton.addEventListener("click", save);
  clearButton.addEventListener("click", clearPending);
  optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

  renderPreview();
}

function renderPreview() {
  const raw = filenameInput.value;
  if (!raw.trim()) {
    previewEl.textContent = "";
    return;
  }
  previewEl.textContent = `→ ${sanitizeZipFilename(applyTemplate(raw))}`;
}

async function save() {
  const raw = filenameInput.value;
  if (!raw.trim()) {
    filenameInput.focus();
    return;
  }

  const filename = sanitizeZipFilename(applyTemplate(raw));
  const now = Date.now();

  const pendingRename = {
    enabled: true,
    filename,
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

  await chrome.storage.local.set({ pendingRename, nameHistory: history });
  window.close();
}

async function clearPending() {
  await chrome.storage.local.remove("pendingRename");
  renderStatus(null);
}

function renderStatus(pendingRename) {
  const active =
    pendingRename?.enabled && Date.now() < pendingRename.expiresAt;

  statusEl.hidden = !active;
  if (active) {
    const remainMin = Math.ceil((pendingRename.expiresAt - Date.now()) / 60000);
    statusTextEl.textContent = `予約中: ${pendingRename.filename}（あと約${remainMin}分有効）`;
  }
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
