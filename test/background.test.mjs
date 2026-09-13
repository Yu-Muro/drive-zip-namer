import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRESETS } from "../lib/settings.js";

let importSequence = 0;

async function loadBackground({
  initialStorage = {},
  initialSessionStorage = {},
  promptResponse = { name: "sample" },
  tabs = [{ id: 1, windowId: 1, active: true, url: "https://drive.google.com/drive/my-drive" }]
} = {}) {
  const storage = initialStorage;
  const sessionStorage = initialSessionStorage;
  let filenameListener;
  let installedListener;
  let messageListener;
  let promptCount = 0;

  function storageArea(target) {
    return {
      async get(keys) {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          requested
            .filter((key) => Object.hasOwn(target, key))
            .map((key) => [key, target[key]])
        );
      },
      async set(values) {
        Object.assign(target, values);
      },
      async remove(key) {
        delete target[key];
      }
    };
  }

  globalThis.chrome = {
    downloads: {
      onDeterminingFilename: {
        addListener(listener) {
          filenameListener = listener;
        }
      }
    },
    runtime: {
      onInstalled: {
        addListener(listener) {
          installedListener = listener;
        }
      },
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    },
    storage: {
      local: storageArea(storage),
      session: storageArea(sessionStorage)
    },
    tabs: {
      async query() {
        return tabs;
      },
      async sendMessage(tabId, message) {
        if (message?.type === "DZN_GET_DRIVE_CONTEXT") {
          return { folder: `folder-${tabId}`, count: tabId };
        }
        promptCount += 1;
        return typeof promptResponse === "function"
          ? promptResponse(tabId, message)
          : promptResponse;
      }
    }
  };

  importSequence += 1;
  await import(`../background.js?test=${importSequence}`);

  return {
    storage,
    sessionStorage,
    runDownload(downloadItem = {
      url: "https://drive.google.com/uc?export=download",
      filename: "drive-download.zip"
    }) {
      return new Promise((resolve) => filenameListener(downloadItem, resolve));
    },
    runInstalled() {
      return installedListener({ reason: "install" });
    },
    getPromptCount() {
      return promptCount;
    },
    registerIntent(tabId, context = {}) {
      const tab = tabs.find((item) => item.id === tabId);
      return new Promise((resolve) => {
        messageListener(
          { type: "DZN_REGISTER_DOWNLOAD_INTENT", context },
          { tab },
          resolve
        );
      });
    }
  };
}

function promptSettings(overrides = {}) {
  return {
    promptOnDownload: true,
    allowMultiple: true,
    autoClearAfterUse: true,
    saveFolder: "",
    conflictAction: "uniquify",
    defaultTemplate: "{date}_",
    ...overrides
  };
}

test("分割ZIP対応が無効なら後続ダウンロードを同じグループにしない", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: false }),
      presets: []
    }
  });

  const first = await app.runDownload();
  const second = await app.runDownload();

  assert.equal(first.filename, "sample.zip");
  assert.equal(second.filename, "sample.zip");
  assert.equal(app.getPromptCount(), 2);
});

test("分割ZIP対応が有効なら後続ダウンロードにpart番号を付ける", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: true }),
      presets: []
    }
  });

  const first = await app.runDownload();
  const second = await app.runDownload();

  assert.equal(first.filename, "sample.zip");
  assert.equal(second.filename, "sample_part2.zip");
  assert.equal(app.getPromptCount(), 1);
});

test("初回インストール時に既定プリセットを保存する", async () => {
  const app = await loadBackground();

  await app.runInstalled();

  assert.deepEqual(app.storage.presets, DEFAULT_PRESETS);
});

test("明示的に空にしたプリセットは初回処理で上書きしない", async () => {
  const app = await loadBackground({ initialStorage: { presets: [] } });

  await app.runInstalled();

  assert.deepEqual(app.storage.presets, []);
});

test("ダウンロード時ダイアログで確定したテンプレートを履歴へ保存する", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: false }),
      presets: [],
      nameHistory: ["old", "{project}_report"]
    },
    promptResponse: { name: "  {project}_report  " }
  });

  await app.runDownload();

  assert.deepEqual(app.storage.nameHistory, ["{project}_report", "old"]);
});

test("service worker 再起動後も分割ZIPの続番を復元する", async () => {
  const local = {
    userSettings: promptSettings({ allowMultiple: true }),
    presets: []
  };
  const session = {};
  const firstWorker = await loadBackground({
    initialStorage: local,
    initialSessionStorage: session
  });

  assert.equal((await firstWorker.runDownload()).filename, "sample.zip");
  assert.equal(session.downloadSessions[0].seq, 1);

  const restartedWorker = await loadBackground({
    initialStorage: local,
    initialSessionStorage: session
  });
  assert.equal((await restartedWorker.runDownload()).filename, "sample_part2.zip");
  assert.equal(restartedWorker.getPromptCount(), 0);
});

test("複数Driveタブの操作をタブ別セッションとして分離する", async () => {
  const tabs = [
    { id: 1, windowId: 1, active: true, url: "https://drive.google.com/drive/folders/a" },
    { id: 2, windowId: 2, active: true, url: "https://drive.google.com/drive/folders/b" }
  ];
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: true }),
      presets: []
    },
    tabs,
    promptResponse: (tabId) => ({ name: `tab-${tabId}` })
  });

  await app.registerIntent(1, { folder: "A", count: 2 });
  assert.equal((await app.runDownload()).filename, "tab-1.zip");
  await app.registerIntent(2, { folder: "B", count: 3 });
  assert.equal((await app.runDownload()).filename, "tab-2.zip");

  assert.deepEqual(
    app.sessionStorage.downloadSessions.map(({ tabId, seq }) => ({ tabId, seq })),
    [
      { tabId: 1, seq: 1 },
      { tabId: 2, seq: 1 }
    ]
  );
});

test("同じタブでも新しいダウンロード操作なら別セッションを開始する", async () => {
  let promptNumber = 0;
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: true }),
      presets: []
    },
    promptResponse: () => ({ name: `download-${++promptNumber}` })
  });

  await app.registerIntent(1);
  assert.equal((await app.runDownload()).filename, "download-1.zip");
  await app.registerIntent(1);
  assert.equal((await app.runDownload()).filename, "download-2.zip");
  assert.equal(app.getPromptCount(), 2);
});

test("同時に届く予約済み分割ZIPへ重複しない連番を割り当てる", async () => {
  const now = Date.now();
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: true }),
      presets: [],
      pendingRename: {
        enabled: true,
        template: "reserved",
        createdAt: now,
        expiresAt: now + 60_000,
        sequence: 0
      }
    }
  });

  const results = await Promise.all([app.runDownload(), app.runDownload()]);
  assert.deepEqual(
    results.map((result) => result.filename),
    ["reserved.zip", "reserved_part2.zip"]
  );
});

test("未解決のテンプレート変数をファイル名へ残さない", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: false }),
      presets: []
    },
    promptResponse: { name: "{folder}_report" }
  });

  assert.equal(await app.runDownload(), undefined);
});

test("複数セッションがあり対象タブを特定できなければ命名しない", async () => {
  const now = Date.now();
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: true }),
      presets: []
    },
    initialSessionStorage: {
      downloadSessions: [
        { id: "a", tabId: 1, base: "a.zip", seq: 1, expiresAt: now + 30_000 },
        { id: "b", tabId: 2, base: "b.zip", seq: 1, expiresAt: now + 30_000 }
      ]
    },
    tabs: [
      { id: 1, windowId: 1, active: true, url: "https://drive.google.com/drive/folders/a" },
      { id: 2, windowId: 2, active: true, url: "https://drive.google.com/drive/folders/b" }
    ]
  });

  assert.equal(await app.runDownload(), undefined);
  assert.equal(app.getPromptCount(), 0);
});

test("Drive以外のZIPには一切介入しない", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings(),
      presets: []
    }
  });

  assert.equal(
    await app.runDownload({
      url: "https://example.com/archive.zip",
      filename: "archive.zip"
    }),
    undefined
  );
  assert.equal(app.getPromptCount(), 0);
});

test("ダウンロード時入力が無効なら予約なしのDrive ZIPへ介入しない", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ promptOnDownload: false }),
      presets: []
    }
  });

  assert.equal(await app.runDownload(), undefined);
  assert.equal(app.getPromptCount(), 0);
});

test("予約テンプレートへDrive文脈と保存設定を反映する", async () => {
  const now = Date.now();
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({
        allowMultiple: false,
        saveFolder: "Drive exports",
        conflictAction: "overwrite"
      }),
      presets: [],
      pendingRename: {
        enabled: true,
        template: "{project}_{folder}_{count}",
        project: "Apollo",
        createdAt: now,
        expiresAt: now + 60_000
      }
    }
  });
  await app.registerIntent(1, { folder: "Invoices", count: 3 });

  assert.deepEqual(await app.runDownload(), {
    filename: "Drive exports/Apollo_Invoices_3.zip",
    conflictAction: "overwrite"
  });
  assert.equal(app.storage.pendingRename, undefined);
  assert.equal(app.getPromptCount(), 0);
});

test("使用済み予約を別タブの新しいダウンロードへ流用しない", async () => {
  const now = Date.now();
  const tabs = [
    { id: 1, windowId: 1, active: true, url: "https://drive.google.com/drive/folders/a" },
    { id: 2, windowId: 2, active: true, url: "https://drive.google.com/drive/folders/b" }
  ];
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: true }),
      presets: [],
      pendingRename: {
        enabled: true,
        template: "reserved",
        createdAt: now,
        expiresAt: now + 60_000,
        sequence: 0
      }
    },
    tabs,
    promptResponse: (tabId) => ({ name: `prompt-${tabId}` })
  });

  await app.registerIntent(1);
  assert.equal((await app.runDownload()).filename, "reserved.zip");
  await app.registerIntent(2);
  assert.equal((await app.runDownload()).filename, "prompt-2.zip");
  assert.equal(app.storage.pendingRename.sessionTabId, 1);
  assert.equal((await app.runDownload()).filename, "reserved_part2.zip");
});

test("期限切れ予約を削除して通常の名前入力へ進む", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: false }),
      presets: [],
      pendingRename: {
        enabled: true,
        template: "expired",
        createdAt: Date.now() - 120_000,
        expiresAt: Date.now() - 60_000
      }
    }
  });

  assert.equal((await app.runDownload()).filename, "sample.zip");
  assert.equal(app.storage.pendingRename, undefined);
  assert.equal(app.getPromptCount(), 1);
});

test("referrerと一致するDriveタブへ名前入力を表示する", async () => {
  const tabs = [
    { id: 1, windowId: 1, active: true, url: "https://drive.google.com/drive/folders/a" },
    { id: 2, windowId: 2, active: true, url: "https://drive.google.com/drive/folders/b" }
  ];
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: false }),
      presets: []
    },
    tabs,
    promptResponse: (tabId) => ({ name: `tab-${tabId}` })
  });

  const result = await app.runDownload({
    url: "https://drive.google.com/uc?export=download",
    referrer: "https://drive.google.com/drive/folders/b",
    filename: "drive-download.zip"
  });
  assert.equal(result.filename, "tab-2.zip");
});

test("名前入力のキャンセル時は元の名前を使い理由を保存する", async () => {
  const app = await loadBackground({
    initialStorage: {
      userSettings: promptSettings({ allowMultiple: false }),
      presets: []
    },
    promptResponse: { cancelled: true }
  });

  assert.equal(await app.runDownload(), undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.storage.lastOperation.status, "skipped");
});
