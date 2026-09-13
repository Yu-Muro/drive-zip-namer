import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRESETS } from "../lib/settings.js";

let importSequence = 0;

async function loadBackground({
  initialStorage = {},
  promptResponse = { name: "sample" }
} = {}) {
  const storage = { ...initialStorage };
  let filenameListener;
  let installedListener;
  let promptCount = 0;

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
      }
    },
    storage: {
      local: {
        async get(keys) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            requested
              .filter((key) => Object.hasOwn(storage, key))
              .map((key) => [key, storage[key]])
          );
        },
        async set(values) {
          Object.assign(storage, values);
        },
        async remove(key) {
          delete storage[key];
        }
      }
    },
    tabs: {
      async query() {
        return [{ id: 1, active: true }];
      },
      async sendMessage() {
        promptCount += 1;
        return promptResponse;
      }
    }
  };

  importSequence += 1;
  await import(`../background.js?test=${importSequence}`);

  return {
    storage,
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
