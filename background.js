// Drive Zip Namer - service worker
// Google Drive由来のZIPダウンロードを検知し、保存ファイル名を差し替える。
//
// 名前の決め方は2通り:
//  1. ポップアップで事前予約されたテンプレート (pendingRename)
//  2. ダウンロード時に content script のモーダルで入力された名前 (promptOnDownload)
//
// どちらも Drive の現在フォルダ名・選択数を content script から取得し、
// {folder}/{count}/{project} などのテンプレート変数を展開する。

import {
  buildSequencedFilename,
  withSaveFolder,
  sanitizeZipFilename,
  applyTemplate
} from "./lib/filename.js";
import { isGoogleDriveZip } from "./lib/drive-detection.js";
import { normalizeSettings } from "./lib/settings.js";

// 分割ZIP対応: 最初のZIP検知からこの時間内に来た後続ZIPには同じ名前+連番を使う
const MULTI_ZIP_WINDOW_MS = 30 * 1000;
// モーダルの応答を待つ最大時間。これを過ぎたらChromeのデフォルト命名に任せる
const PROMPT_TIMEOUT_MS = 2 * 60 * 1000;

// 「ダウンロード時モーダル」で決めた名前を、同時/連続して落ちてくる分割ZIPで
// 共有するためのグループ。service worker のメモリ上に保持する。
let promptGroup = null; // { basePromise: Promise<string|null>, seq: number, expiresAt: number }

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleFilename(downloadItem, suggest);
  return true; // suggest() を非同期に呼ぶため
});

async function handleFilename(downloadItem, suggest) {
  let answered = false;
  const respond = (arg) => {
    if (answered) return;
    answered = true;
    suggest(arg);
  };

  try {
    const stored = await chrome.storage.local.get([
      "pendingRename",
      "userSettings",
      "presets",
      "lastProject"
    ]);
    const settings = normalizeSettings(stored.userSettings);
    const presets = Array.isArray(stored.presets) ? stored.presets : [];
    const lastProject = stored.lastProject ?? "";
    const pendingRename = stored.pendingRename;
    const now = Date.now();

    // --- 1. ポップアップで事前予約されたテンプレートを最優先 ---
    if (
      pendingRename?.enabled &&
      now <= pendingRename.expiresAt &&
      isGoogleDriveZip(downloadItem)
    ) {
      const template = pendingRename.template ?? pendingRename.filename ?? "";
      const reserveDate = new Date(pendingRename.createdAt ?? now);

      // {folder}/{count} が含まれるときだけ Drive文脈を取りに行く
      const context = /\{(folder|count)\}/.test(template)
        ? await getDriveContext()
        : {};

      const base = sanitizeZipFilename(
        applyTemplate(template, {
          now: reserveDate,
          project: pendingRename.project ?? lastProject,
          folder: context.folder,
          count: context.count
        })
      );

      const sequence = (pendingRename.sequence ?? 0) + 1;
      respond({
        filename: withSaveFolder(
          buildSequencedFilename(base, sequence),
          settings.saveFolder
        ),
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

    // 同じ操作で分割された後続ZIPは、同じ名前+連番で共有する
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
    promptGroup = {
      seq: 0,
      expiresAt: now + PROMPT_TIMEOUT_MS + MULTI_ZIP_WINDOW_MS,
      basePromise: askForName(settings, presets, lastProject)
    };

    const base = await promptGroup.basePromise;
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
 * Driveタブの content script にモーダル表示を依頼し、確定した名前を返す。
 * キャンセル・タイムアウト・タブ無し・失敗時は null（＝Chromeのデフォルト命名）。
 */
async function askForName(settings, presets, project) {
  try {
    const tab = await findDriveTab();
    if (!tab?.id) return null;

    const now = new Date();
    const values = { ...dateValues(now), project };

    const resp = await withTimeout(
      chrome.tabs.sendMessage(tab.id, {
        type: "DZN_PROMPT_ZIP_NAME",
        defaultTemplate: settings.defaultTemplate,
        values,
        presets
      }),
      PROMPT_TIMEOUT_MS
    );

    if (resp?.timedOut || resp?.cancelled || !resp?.name?.trim()) {
      return null;
    }

    // content script が読み取った folder/count を使って権威的に展開する
    return sanitizeZipFilename(
      applyTemplate(resp.name, {
        now,
        project,
        folder: resp.folder,
        count: resp.count
      })
    );
  } catch (error) {
    console.warn("Drive Zip Namer: prompt unavailable", error);
    return null;
  }
}

/** Driveタブに現在のフォルダ名・選択数を問い合わせる（取得できなければ空） */
async function getDriveContext() {
  try {
    const tab = await findDriveTab();
    if (!tab?.id) return {};
    const resp = await withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "DZN_GET_DRIVE_CONTEXT" }),
      3000
    );
    if (resp?.timedOut) return {};
    return { folder: resp?.folder, count: resp?.count };
  } catch {
    return {};
  }
}

function dateValues(now) {
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return { date, time, datetime: `${date}_${time}` };
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
