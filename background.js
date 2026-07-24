// Drive Zip Namer - service worker
// Google Drive由来のZIPダウンロードを検知し、保存ファイル名を差し替える。

import { buildSequencedFilename, withSaveFolder } from "./lib/filename.js";
import { isGoogleDriveZip } from "./lib/drive-detection.js";

// 分割ZIP対応：最初のZIP検知からこの時間内に来た後続ZIPには同じ名前+連番を使う
const MULTI_ZIP_WINDOW_MS = 30 * 1000;

const DEFAULT_SETTINGS = {
  saveFolder: "",
  conflictAction: "uniquify",
  autoClearAfterUse: true,
  allowMultiple: true
};

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleFilename(downloadItem, suggest);
  // suggest() を非同期に呼ぶため true を返す
  return true;
});

async function handleFilename(downloadItem, suggest) {
  try {
    const { pendingRename, userSettings } = await chrome.storage.local.get([
      "pendingRename",
      "userSettings"
    ]);
    const settings = { ...DEFAULT_SETTINGS, ...userSettings };

    if (!pendingRename?.enabled) {
      suggest();
      return;
    }

    if (Date.now() > pendingRename.expiresAt) {
      await chrome.storage.local.remove("pendingRename");
      suggest();
      return;
    }

    if (!isGoogleDriveZip(downloadItem)) {
      suggest();
      return;
    }

    const now = Date.now();
    const sequence = (pendingRename.sequence ?? 0) + 1;
    const named = buildSequencedFilename(pendingRename.filename, sequence);
    const finalFilename = withSaveFolder(named, settings.saveFolder);

    suggest({
      filename: finalFilename,
      conflictAction: settings.conflictAction
    });

    const shouldKeepForSplitZips = settings.allowMultiple;

    if (shouldKeepForSplitZips) {
      // 分割ZIPに備えて短時間だけ同じ名前ルールを維持する
      const firstUsedAt = pendingRename.firstUsedAt ?? now;
      await chrome.storage.local.set({
        pendingRename: {
          ...pendingRename,
          sequence,
          firstUsedAt,
          expiresAt: firstUsedAt + MULTI_ZIP_WINDOW_MS
        }
      });
    } else if (settings.autoClearAfterUse) {
      await chrome.storage.local.remove("pendingRename");
    }
  } catch (error) {
    // 失敗時はChromeのデフォルト命名に任せる
    console.error("Drive Zip Namer: rename failed", error);
    try {
      suggest();
    } catch {
      // suggestが二重呼び出しになった場合は無視
    }
  }
}
