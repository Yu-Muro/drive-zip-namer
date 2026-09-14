import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getUiLanguage, t } from "../lib/i18n.js";

test("日英の翻訳キーが一致する", async () => {
  const [ja, en] = await Promise.all(
    ["ja", "en"].map(async (locale) =>
      JSON.parse(
        await readFile(
          new URL(`../_locales/${locale}/messages.json`, import.meta.url),
          "utf8"
        )
      )
    )
  );

  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
  assert.ok(Object.values(ja).every((entry) => typeof entry.message === "string"));
  assert.ok(Object.values(en).every((entry) => typeof entry.message === "string"));
});

test("Chrome外では日本語へフォールバックし、置換値を展開する", () => {
  assert.equal(getUiLanguage(), "ja");
  assert.equal(t("reservationActive", ["report", 3]), "予約中: report（あと約3分有効）");
});

test("Chromeの翻訳APIが利用できる場合は翻訳結果を優先する", () => {
  const previousChrome = globalThis.chrome;
  let receivedSubstitutions;
  globalThis.chrome = {
    i18n: {
      getMessage(key, substitutions) {
        receivedSubstitutions = substitutions;
        return key === "countdown" ? `${substitutions[0]} seconds` : "";
      },
      getUILanguage() {
        return "en-US";
      }
    }
  };

  try {
    assert.equal(t("countdown", 5), "5 seconds");
    assert.deepEqual(receivedSubstitutions, ["5"]);
    assert.equal(getUiLanguage(), "en-US");
  } finally {
    globalThis.chrome = previousChrome;
  }
});
