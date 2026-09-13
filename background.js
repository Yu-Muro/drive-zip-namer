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
  inspectTemplate
} from "./lib/filename.js";
import { isGoogleDriveZip } from "./lib/drive-detection.js";
import {
  DEFAULT_PRESETS,
  migrateStorageData,
  normalizeNameHistory,
  normalizePresets,
  normalizeSettings
} from "./lib/settings.js";

// 分割ZIP対応: 最初のZIP検知からこの時間内に来た後続ZIPには同じ名前+連番を使う
const MULTI_ZIP_WINDOW_MS = 30 * 1000;
// モーダルの応答を待つ最大時間。これを過ぎたらChromeのデフォルト命名に任せる
const PROMPT_TIMEOUT_MS = 2 * 60 * 1000;
const SESSION_STORAGE_KEY = "downloadSessions";
const INTENT_STORAGE_KEY = "downloadIntents";
const DOWNLOAD_INTENT_TTL_MS = 15 * 1000;
const MAX_SESSIONS = 20;

// 名前入力中の Promise だけは同一 service worker 内で共有する。確定後の状態は
// chrome.storage.session に保存し、service worker の再起動後も復元できるようにする。
const inFlightPromptGroups = new Map();
let sessionLock = Promise.resolve();

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleFilename(downloadItem, suggest);
  return true; // suggest() を非同期に呼ぶため
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "DZN_REGISTER_DOWNLOAD_INTENT") return false;

  rememberDownloadIntent(sender.tab, message.context)
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});

// 新規インストール・更新時に初期プリセットを用意する。
// ユーザーが意図的に空にした配列は上書きしない。
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    "schemaVersion",
    "userSettings",
    "presets",
    "nameHistory",
    "lastProject"
  ]);
  await chrome.storage.local.set(migrateStorageData(stored));
});

async function handleFilename(downloadItem, suggest) {
  let answered = false;
  const respond = (arg) => {
    if (answered) return;
    answered = true;
    suggest(arg);
    if (arg?.filename) {
      void recordOperation("renamed", "名前を変更しました。", arg.filename);
    }
  };

  try {
    const stored = await chrome.storage.local.get([
      "pendingRename",
      "userSettings",
      "presets",
      "lastProject"
    ]);
    const settings = normalizeSettings(stored.userSettings);
    const presets = stored.presets === undefined
      ? DEFAULT_PRESETS.slice()
      : normalizePresets(stored.presets);
    const lastProject = stored.lastProject ?? "";
    const now = Date.now();

    // --- 1. ポップアップで事前予約されたテンプレートを最優先 ---
    const pendingRename = isGoogleDriveZip(downloadItem)
      ? await claimPendingRename(now, settings)
      : null;
    if (pendingRename) {
      const template = pendingRename.template ?? pendingRename.filename ?? "";
      const reserveDate = new Date(pendingRename.createdAt ?? now);

      // {folder}/{count} が含まれるときだけ Drive文脈を取りに行く
      const context = /\{(folder|count)\}/.test(template)
        ? await getDriveContext(downloadItem)
        : {};

      const base = resolveZipTemplate(
        template,
        {
          now: reserveDate,
          project: pendingRename.project ?? lastProject,
          folder: context.folder,
          count: context.count
        }
      );
      if (!base) {
        await chrome.storage.local.remove("pendingRename");
        void recordOperation(
          "error",
          "テンプレートに未解決または未対応の変数があります。"
        );
        respond();
        return;
      }

      respond({
        filename: withSaveFolder(
          buildSequencedFilename(base, pendingRename.claimedSequence),
          settings.saveFolder
        ),
        conflictAction: settings.conflictAction
      });

      return;
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

    const target = await resolveDriveTarget(downloadItem);
    const groupKey = target?.tab?.id == null ? null : `tab:${target.tab.id}`;

    // 同じタブで名前入力中の後続ZIPは、その入力結果を共有する。
    const activeGroup = settings.allowMultiple && groupKey && target.source !== "intent"
      ? inFlightPromptGroups.get(groupKey)
      : null;
    if (activeGroup && now <= activeGroup.expiresAt) {
      const base = await activeGroup.basePromise;
      if (!base) {
        inFlightPromptGroups.delete(groupKey);
        void recordOperation("skipped", "名前入力がキャンセルまたは中断されました。");
        respond();
        return;
      }
      activeGroup.seq += 1;
      activeGroup.expiresAt = Date.now() + MULTI_ZIP_WINDOW_MS;
      await saveDownloadSession({
        id: activeGroup.id,
        tabId: target.tab.id,
        base,
        seq: activeGroup.seq,
        expiresAt: activeGroup.expiresAt
      });
      respond({
        filename: withSaveFolder(
          buildSequencedFilename(base, activeGroup.seq),
          settings.saveFolder
        ),
        conflictAction: settings.conflictAction
      });
      return;
    }

    // service worker の再起動前に確定済みだった分割ZIPセッションを復元する。
    if (settings.allowMultiple && target?.source !== "intent") {
      const resumed = await claimDownloadSession(target?.tab?.id, now);
      if (resumed) {
        respond({
          filename: withSaveFolder(
            buildSequencedFilename(resumed.base, resumed.seq),
            settings.saveFolder
          ),
          conflictAction: settings.conflictAction
        });
        return;
      }
    }

    // 対象タブを安全に決められない場合、別タブへモーダルを出さない。
    if (!target?.tab?.id) {
      void recordOperation(
        "error",
        "対象のDriveタブを安全に特定できなかったため、元の名前を使用しました。"
      );
      respond();
      return;
    }

    // 新しいグループ: モーダルを表示して名前を取得
    const currentGroup = {
      id: crypto.randomUUID(),
      seq: 0,
      expiresAt: now + PROMPT_TIMEOUT_MS + MULTI_ZIP_WINDOW_MS,
      basePromise: askForName(settings, presets, lastProject, target.tab)
    };
    if (settings.allowMultiple && groupKey) {
      inFlightPromptGroups.set(groupKey, currentGroup);
    }

    const base = await currentGroup.basePromise;
    currentGroup.expiresAt = Date.now() + MULTI_ZIP_WINDOW_MS;

    if (!base) {
      if (groupKey) inFlightPromptGroups.delete(groupKey);
      void recordOperation("skipped", "名前入力がキャンセルまたは中断されました。");
      respond();
      return;
    }

    currentGroup.seq += 1;
    if (settings.allowMultiple) {
      await saveDownloadSession({
        id: currentGroup.id,
        tabId: target.tab.id,
        base,
        seq: currentGroup.seq,
        expiresAt: currentGroup.expiresAt
      });
    }
    respond({
      filename: withSaveFolder(
        buildSequencedFilename(base, currentGroup.seq),
        settings.saveFolder
      ),
      conflictAction: settings.conflictAction
    });
  } catch (error) {
    console.error("Drive Zip Namer: rename failed", error);
    void recordOperation("error", "名前の変更中にエラーが発生しました。");
    respond();
  }
}

/**
 * Driveタブの content script にモーダル表示を依頼し、確定した名前を返す。
 * キャンセル・タイムアウト・タブ無し・失敗時は null（＝Chromeのデフォルト命名）。
 */
async function askForName(settings, presets, project, tab) {
  try {
    if (!tab?.id) return null;

    const now = new Date();
    const values = { ...dateValues(now), project };

    const resp = await withTimeout(
      chrome.tabs.sendMessage(tab.id, {
        type: "DZN_PROMPT_ZIP_NAME",
        defaultTemplate: settings.defaultTemplate,
        values,
        presets,
        timeoutMs: PROMPT_TIMEOUT_MS
      }),
      PROMPT_TIMEOUT_MS
    );

    if (resp?.timedOut || resp?.cancelled || !resp?.name?.trim()) {
      return null;
    }

    await rememberName(resp.name);

    // content script が読み取った folder/count を使って権威的に展開する
    return resolveZipTemplate(
      resp.name,
      {
        now,
        project,
        folder: resp.folder,
        count: resp.count
      }
    );
  } catch (error) {
    console.warn("Drive Zip Namer: prompt unavailable", error);
    return null;
  }
}

/** ダウンロード時ダイアログで確定したテンプレートを履歴へ保存する。 */
async function rememberName(name) {
  try {
    const value = String(name ?? "").trim();
    if (!value) return;

    const { nameHistory } = await chrome.storage.local.get("nameHistory");
    const history = normalizeNameHistory([
      value,
      ...(Array.isArray(nameHistory) ? nameHistory : []).filter(
        (item) => typeof item === "string" && item !== value
      )
    ]);

    await chrome.storage.local.set({ nameHistory: history });
  } catch (error) {
    // 履歴保存の失敗で本来のダウンロードを妨げない。
    console.warn("Drive Zip Namer: failed to save name history", error);
  }
}

/** Driveタブに現在のフォルダ名・選択数を問い合わせる（取得できなければ空） */
async function getDriveContext(downloadItem) {
  try {
    const target = await resolveDriveTarget(downloadItem);
    if (target?.context?.folder || target?.context?.count) {
      return target.context;
    }
    const tab = target?.tab;
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

function resolveZipTemplate(template, values) {
  const inspected = inspectTemplate(template, values);
  if (
    inspected.malformed ||
    inspected.unknown.length > 0 ||
    inspected.unresolved.length > 0
  ) {
    return null;
  }
  return sanitizeZipFilename(inspected.expanded);
}

async function recordOperation(status, message, filename = "") {
  try {
    await chrome.storage.local.set({
      lastOperation: {
        status,
        message,
        filename,
        at: Date.now()
      }
    });
    if (chrome.action?.setBadgeText) {
      await chrome.action.setBadgeText({ text: status === "renamed" ? "✓" : "!" });
      if (chrome.action.setBadgeBackgroundColor) {
        await chrome.action.setBadgeBackgroundColor({
          color: status === "renamed" ? "#188038" : "#d93025"
        });
      }
    }
  } catch {
    // 状態表示の失敗でダウンロードを妨げない。
  }
}

function storageSession() {
  return chrome.storage.session ?? chrome.storage.local;
}

async function claimPendingRename(now, settings) {
  return withSessionLock(async () => {
    const { pendingRename } = await chrome.storage.local.get("pendingRename");
    if (!pendingRename?.enabled) return null;
    if (!Number.isFinite(pendingRename.expiresAt) || now > pendingRename.expiresAt) {
      await chrome.storage.local.remove("pendingRename");
      return null;
    }

    const claimedSequence = settings.allowMultiple
      ? (Number.isInteger(pendingRename.sequence) ? pendingRename.sequence : 0) + 1
      : 1;
    if (settings.allowMultiple) {
      const firstUsedAt = Number.isFinite(pendingRename.firstUsedAt)
        ? pendingRename.firstUsedAt
        : now;
      await chrome.storage.local.set({
        pendingRename: {
          ...pendingRename,
          sequence: claimedSequence,
          firstUsedAt,
          expiresAt: firstUsedAt + MULTI_ZIP_WINDOW_MS
        }
      });
    } else if (settings.autoClearAfterUse) {
      await chrome.storage.local.remove("pendingRename");
    }
    return { ...pendingRename, claimedSequence };
  });
}

async function rememberDownloadIntent(tab, context) {
  if (!tab?.id || !String(tab.url ?? "").startsWith("https://drive.google.com/")) {
    return;
  }

  await withSessionLock(async () => {
    const area = storageSession();
    const now = Date.now();
    const stored = await area.get(INTENT_STORAGE_KEY);
    const intents = normalizeTimedList(stored[INTENT_STORAGE_KEY], now).slice(-9);
    intents.push({
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      at: now,
      context: normalizeContext(context)
    });
    await area.set({ [INTENT_STORAGE_KEY]: intents });
  });
}

async function resolveDriveTarget(downloadItem) {
  const tabs = await chrome.tabs.query({ url: "https://drive.google.com/*" });
  if (tabs.length === 0) return null;

  const referrer = safeUrl(downloadItem?.referrer);
  if (referrer?.hostname === "drive.google.com") {
    const exact = tabs.find((tab) => sameDriveLocation(tab.url, referrer));
    if (exact) return { tab: exact, source: "referrer" };
  }

  const intent = await consumeDownloadIntent(tabs);
  if (intent) {
    return {
      tab: tabs.find((tab) => tab.id === intent.tabId),
      context: intent.context,
      source: "intent"
    };
  }

  const activeSessions = await loadDownloadSessions(Date.now());
  if (activeSessions.length === 1) {
    const sessionTab = tabs.find((tab) => tab.id === activeSessions[0].tabId);
    if (sessionTab) return { tab: sessionTab, source: "session" };
  }
  if (activeSessions.length > 1) return null;

  const activeTabs = tabs.filter((tab) => tab.active);
  if (activeTabs.length === 1) return { tab: activeTabs[0], source: "active" };
  if (tabs.length === 1) return { tab: tabs[0], source: "only-tab" };
  return null;
}

async function consumeDownloadIntent(tabs) {
  return withSessionLock(async () => {
    const area = storageSession();
    const now = Date.now();
    const stored = await area.get(INTENT_STORAGE_KEY);
    const intents = normalizeTimedList(stored[INTENT_STORAGE_KEY], now).filter(
      (intent) => tabs.some((tab) => tab.id === intent.tabId)
    );
    const intent = intents.shift() ?? null;
    await area.set({ [INTENT_STORAGE_KEY]: intents });
    return intent;
  });
}

function normalizeTimedList(raw, now) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item) =>
      item &&
      Number.isFinite(item.at) &&
      now - item.at >= 0 &&
      now - item.at <= DOWNLOAD_INTENT_TTL_MS
  );
}

function normalizeContext(raw) {
  if (!raw || typeof raw !== "object") return {};
  return {
    folder: typeof raw.folder === "string" ? raw.folder : null,
    count: Number.isInteger(raw.count) && raw.count > 0 ? raw.count : null
  };
}

async function loadDownloadSessions(now) {
  const area = storageSession();
  const stored = await area.get(SESSION_STORAGE_KEY);
  const sessions = Array.isArray(stored[SESSION_STORAGE_KEY])
    ? stored[SESSION_STORAGE_KEY].filter(
        (session) =>
          session &&
          typeof session.id === "string" &&
          Number.isInteger(session.tabId) &&
          typeof session.base === "string" &&
          Number.isInteger(session.seq) &&
          Number.isFinite(session.expiresAt) &&
          now <= session.expiresAt
      )
    : [];
  return sessions.slice(-MAX_SESSIONS);
}

async function saveDownloadSession(session) {
  await withSessionLock(async () => {
    const area = storageSession();
    const sessions = (await loadDownloadSessions(Date.now())).filter(
      (item) => item.id !== session.id && item.tabId !== session.tabId
    );
    sessions.push(session);
    await area.set({ [SESSION_STORAGE_KEY]: sessions.slice(-MAX_SESSIONS) });
  });
}

async function claimDownloadSession(tabId, now) {
  return withSessionLock(async () => {
    const area = storageSession();
    const sessions = await loadDownloadSessions(now);
    const candidates = tabId == null
      ? sessions
      : sessions.filter((session) => session.tabId === tabId);
    if (candidates.length !== 1) return null;

    const claimed = candidates[0];
    claimed.seq += 1;
    claimed.expiresAt = now + MULTI_ZIP_WINDOW_MS;
    await area.set({ [SESSION_STORAGE_KEY]: sessions });
    return claimed;
  });
}

async function withSessionLock(task) {
  const previous = sessionLock;
  let release;
  sessionLock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function safeUrl(value) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function sameDriveLocation(tabUrl, referenceUrl) {
  const tab = safeUrl(tabUrl);
  return Boolean(
    tab &&
      tab.hostname === referenceUrl.hostname &&
      tab.pathname === referenceUrl.pathname &&
      tab.search === referenceUrl.search
  );
}

function withTimeout(promise, ms) {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}
