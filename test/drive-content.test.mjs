import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const contentScript = await readFile(
  new URL("../content/drive-content.js", import.meta.url),
  "utf8"
);

function readContext({ title = "Google Drive", breadcrumbs = [] } = {}) {
  let messageListener;
  const breadcrumbContainer = {
    querySelectorAll() {
      return breadcrumbs.map((label) => ({
        textContent: label,
        getAttribute() {
          return null;
        }
      }));
    }
  };
  const document = {
    title,
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector.includes("Breadcrumb") && breadcrumbs.length > 0
        ? [breadcrumbContainer]
        : [];
    }
  };
  const window = {};
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListener = listener;
        }
      }
    }
  };

  vm.runInNewContext(contentScript, {
    window,
    document,
    chrome,
    Element: class Element {},
    console,
    setTimeout,
    clearTimeout
  });

  return new Promise((resolve) => {
    messageListener({ type: "DZN_GET_DRIVE_CONTEXT" }, {}, resolve);
  });
}

test("Driveのタイトルからフォルダ名を読み取る", async () => {
  const context = await readContext({ title: "(2) 請求書 — Google ドライブ" });
  assert.equal(context.folder, "請求書");
  assert.equal(context.count, null);
});

test("タイトルよりパンくずの現在フォルダ名を優先する", async () => {
  const context = await readContext({
    title: "Google Drive",
    breadcrumbs: ["マイドライブ", "2026年度", "請求書"]
  });
  assert.equal(context.folder, "請求書");
  assert.equal(context.count, null);
});
