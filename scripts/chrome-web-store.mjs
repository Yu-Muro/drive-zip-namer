import { readFileSync } from "node:fs";

const API_BASE = "https://chromewebstore.googleapis.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 60;

const command = process.argv[2];
if (!["upload", "publish"].includes(command)) {
  fail("コマンドは upload または publish を指定してください。");
}

const accessToken = requireEnv("CHROME_WEB_STORE_ACCESS_TOKEN");
const publisherId = requireIdentifier("CHROME_WEB_STORE_PUBLISHER_ID");
const extensionId = requireIdentifier("CHROME_WEB_STORE_EXTENSION_ID");
const itemName = `publishers/${publisherId}/items/${extensionId}`;

if (command === "upload") {
  const archivePath = process.argv[3];
  if (!archivePath) fail("アップロードするZIPファイルを指定してください。");
  await upload(archivePath);
} else if (command === "publish") {
  await publish();
}

async function upload(archivePath) {
  let archive;
  try {
    archive = readFileSync(archivePath);
  } catch (error) {
    fail(`ZIPファイルを読み込めません: ${error.message}`);
  }

  const result = await request(
    `${API_BASE}/upload/v2/${itemName}:upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: archive
    }
  );

  if (result.uploadState === "SUCCEEDED") {
    console.log(`Chrome Web Store upload OK (v${result.crxVersion ?? "unknown"})`);
    return;
  }

  if (result.uploadState !== "IN_PROGRESS") {
    fail(`Chrome Web Storeへのアップロードに失敗しました: ${result.uploadState ?? "unknown"}`);
  }

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    await delay(POLL_INTERVAL_MS);
    const status = await request(`${API_BASE}/v2/${itemName}:fetchStatus`);

    if (status.lastAsyncUploadState === "SUCCEEDED") {
      console.log("Chrome Web Store upload OK");
      return;
    }

    if (status.lastAsyncUploadState === "FAILED") {
      fail("Chrome Web StoreがZIPの処理に失敗しました。Developer Dashboardを確認してください。");
    }
  }

  fail("Chrome Web Storeのアップロード処理が時間内に完了しませんでした。");
}

async function publish() {
  const result = await request(`${API_BASE}/v2/${itemName}:publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publishType: "DEFAULT_PUBLISH",
      blockOnWarnings: true
    })
  });

  console.log(`Chrome Web Store submission OK (${result.state ?? "submitted"})`);
}

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers
      }
    });
  } catch (error) {
    fail(`Chrome Web Store APIに接続できません: ${error.message}`);
  }
  const body = await response.text();
  let result = {};

  if (body) {
    try {
      result = JSON.parse(body);
    } catch {
      fail(`Chrome Web Store APIから不正な応答が返されました (HTTP ${response.status})。`);
    }
  }

  if (!response.ok) {
    const detail = result?.error?.message ?? body ?? response.statusText;
    fail(`Chrome Web Store APIエラー (HTTP ${response.status}): ${detail}`);
  }

  return result;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`環境変数 ${name} が設定されていません。`);
  return value;
}

function requireIdentifier(name) {
  const value = requireEnv(name);
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    fail(`環境変数 ${name} の形式が不正です。`);
  }
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
