// Drive Zip Namer - service worker
// Google Drive由来のZIPダウンロードを検知し、保存ファイル名を差し替える。
//
// 名前の決め方は2通り:
//  1. ポップアップで事前予約された名前 (pendingRename)
//  2. ダウンロード時に content script のモーダルで入力された名前 (promptOnDownload)

import {
  buildSequencedFilename,
  withSaveFolder,
  sanitizeZipFilename,
  applyTemplate
} from "./lib/filename.js";
import { isGoogleDriveZip } from "./lib/drive-detection.js";

// 分割ZIP対応: 最初のZIP検知からこの時間内に来た後続ZIPには同じ名前+連番を使う
const MULTI_ZIP_WINDOW_MS = 30 * 1000;
// モーダルの応答を待つ最大時間。これを過ぎたらChromeのデフォルト命名に任せる
const PROMPT_TIMEOUT_MS = 2 * 60 * 1000;

const DEFAULT_SETTINGS = {
  saveFolder: "",
  conflictAction: "uniquify",
  autoClearAfterUse: true,
  allowMultiple: true,
  promptOnDownload: true
};

// 「ダウンロード時モーダル」で決めた名前を、同時/連続して落ちてくる分割ZIPで
// 共有するためのグループ。service worker のメモリ上に保持する
// (保留中のダウンロードが worker を生存させ続けるため、この間は保持される)。
let promptGroup = null; // { basePromise: Promise<string|null>, seq: number, expiresAt: number }

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleFilename(downloadItem, suggest);
  // suggest() を非同期に呼ぶため true を返す
  return true;
});

async function handleFilename(downloadItem, suggest) {
  let answered = false;
  const respond = (arg) => {
    if (answered) return;
    answered = true;
    suggest(arg);
  };

  try {
    const { pendingRename, userSettings } = await chrome.storage.local.get([
      "pendingRename",
      "userSettings"
    ]);
    const settings = { ...DEFAULT_SETTINGS, ...userSettings };
    const now = Date.now();

    // --- 1. ポップアップで事前予約された名前があれば最優先 ---
    if (
      pendingRename?.enabled &&
      now <= pendingRename.expiresAt &&
      isGoogleDriveZip(downloadItem)
    ) {
      const sequence = (pendingRename.sequence ?? 0) + 1;
      const named = buildSequencedFilename(pendingRename.filename, sequence);
      respond({
        filename: withSaveFolder(named, settings.saveFolder),
        conflictAction: settings.conflictAction
      });

      if (settings.allowMultiple) {
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
      return;
    }

    // 期限切れの予約は掃除しておく
    if (pendingRename?.enabled && now > pendingRename.expiresAt) {
      await chrome.storage.local.remove("pendingRename");
    }

    // --- Drive由来のZIP以外はChromeに任せる ---
    if (!isGoogleDriveZip(downloadItem)) {
      respond();
      return;
    }

    // --- 2. ダウンロード時モーダルで名前を尋ねる ---
    if (!settings.promptOnDownload) {
      respond();
      return;
    }

    // 同じダウンロード操作で分割された後続ZIPは、同じ名前+連番で共有する
    if (promptGroup && now <= promptGroup.expiresAt) {
      const base = await promptGroup.basePromise;
      if (!base) {
        respond();
        return;
      }
      promptGroup.seq += 1;
      promptGroup.expiresAt = Date.now() + MULTI_ZIP_WINDOW_MS;
      respond({
        filename: withSaveFolder(
          buildSequencedFilename(base, promptGroup.seq),
          settings.saveFolder
        ),
        conflictAction: settings.conflictAction
      });
      return;
    }

    // 新しいグループ: モーダルを表示して名前を取得
    const defaultName = applyTemplate("{date}_");
    promptGroup = {
      seq: 0,
      // 入力待ちの間に来た後続ZIPも同じグループに入れられるよう長めに設定
      expiresAt: now + PROMPT_TIMEOUT_MS + MULTI_ZIP_WINDOW_MS,
      basePromise: askForName(defaultName)
    };

    const base = await promptGroup.basePromise;
    // 名前が決まったら、分割ZIP待ちの窓を短くする
    promptGroup.expiresAt = Date.now() + MULTI_ZIP_WINDOW_MS;

    if (!base) {
      respond();
      return;
    }

    promptGroup.seq += 1;
    respond({
      filename: withSaveFolder(
        buildSequencedFilename(base, promptGroup.seq),
        settings.saveFolder
      ),
      conflictAction: settings.conflictAction
    });
  } catch (error) {
    console.error("Drive Zip Namer: rename failed", error);
    respond();
  }
}

/**
 * Driveタブの content script にモーダル表示を依頼し、入力された名前を返す。
 * キャンセル・タイムアウト・タブ無し・失敗時は null（＝Chromeのデフォルト命名）。
 */
async function askForName(defaultName) {
  try {
    const tab = await findDriveTab();
    if (!tab?.id) return null;

    const resp = await withTimeout(
      chrome.tabs.sendMessage(tab.id, {
        type: "DZN_PROMPT_ZIP_NAME",
        defaultName
      }),
      PROMPT_TIMEOUT_MS
    );

    if (resp?.timedOut || resp?.cancelled || !resp?.name?.trim()) {
      return null;
    }
    return sanitizeZipFilename(applyTemplate(resp.name));
  } catch (error) {
    // content script 未注入などで sendMessage が失敗するケース
    console.warn("Drive Zip Namer: prompt unavailable", error);
    return null;
  }
}

async function findDriveTab() {
  const tabs = await chrome.tabs.query({ url: "https://drive.google.com/*" });
  if (tabs.length === 0) return null;
  return tabs.find((t) => t.active) ?? tabs[0];
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms))
  ]);
}
