// Drive Zip Namer - content script
// Google Drive のページ上で 2 つの役割を持つ:
//   1. 現在のフォルダ名・選択ファイル数を（ベストエフォートで）読み取る
//   2. service worker からの依頼で「ZIPファイル名を入力するモーダル」を表示する
//
// Drive の DOM 構造には極力依存しない。フォルダ名は document.title から得るのが
// 最も安定するため、それを主に使う。モーダルは自前の Shadow DOM を差し込むだけ。

(() => {
  if (window.__driveZipNamerInjected) return;
  window.__driveZipNamerInjected = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DZN_GET_DRIVE_CONTEXT") {
      sendResponse(readDriveContext());
      return false;
    }
    if (message?.type === "DZN_PROMPT_ZIP_NAME") {
      const context = readDriveContext();
      const values = { ...message.values, ...context };
      showModal({
        defaultTemplate: message.defaultTemplate || "",
        presets: Array.isArray(message.presets) ? message.presets : [],
        values
      }).then((result) => sendResponse({ ...result, ...context }));
      return true; // sendResponse を非同期で呼ぶ
    }
    return false;
  });

  // --- Drive画面から文脈を読む（ベストエフォート） ---------------------------

  function readDriveContext() {
    return { folder: readFolderName(), count: readSelectedCount() };
  }

  function readFolderName() {
    // 例: "請求書 - Google ドライブ" / "Folder - Google Drive"
    const title = document.title || "";
    const cleaned = title
      .replace(/\s*[-–]\s*Google\s*(ドライブ|Drive)\s*$/i, "")
      .trim();
    if (!cleaned || /^Google\s*(ドライブ|Drive)$/i.test(cleaned)) return null;
    return cleaned;
  }

  function readSelectedCount() {
    // 選択行はベストエフォートで数える。取得できなければ null。
    const count = document.querySelectorAll('[aria-selected="true"]').length;
    return count > 0 ? count : null;
  }

  // 表示用の簡易展開（背景の applyTemplate と同じ結果を目指すが、あくまで表示用）
  function expand(template, values) {
    let out = String(template ?? "");
    for (const [key, val] of Object.entries(values)) {
      if (val == null) continue;
      out = out.replaceAll(`{${key}}`, String(val));
    }
    return out;
  }

  // --- モーダル -------------------------------------------------------------

  const CSS = `
    :host { all: initial; }
    .overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(32, 33, 36, 0.5);
      font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    }
    .dialog {
      width: min(440px, calc(100vw - 48px));
      background: #fff; color: #202124;
      border-radius: 12px; padding: 20px;
      box-shadow: 0 12px 40px rgba(0,0,0,.3);
    }
    @media (prefers-color-scheme: dark) {
      .dialog { background: #2d2e31; color: #e8eaed; }
      .field input { background: #202124; color: #e8eaed; border-color: #5f6368; }
    }
    h2 { margin: 0 0 4px; font-size: 16px; }
    p.sub { margin: 0 0 16px; font-size: 12px; color: #5f6368; }
    @media (prefers-color-scheme: dark) { p.sub { color: #9aa0a6; } }
    .presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
    .chip {
      border: none; border-radius: 999px; padding: 5px 12px;
      background: #e8f0fe; color: #1a73e8; font-size: 12px; cursor: pointer;
      font-family: inherit;
    }
    .chip:hover { background: #d2e3fc; }
    .field { display: flex; align-items: center; gap: 8px; }
    .field input {
      flex: 1; padding: 10px 12px; font-size: 14px;
      border: 1px solid #dadce0; border-radius: 8px; outline: none;
    }
    .field input:focus { border-color: #1a73e8; box-shadow: 0 0 0 1px #1a73e8; }
    .ext { color: #5f6368; font-size: 14px; }
    .preview { margin: 8px 0 0; font-size: 12px; color: #1a73e8; word-break: break-all; min-height: 1.2em; }
    .hint { margin: 6px 0 0; font-size: 11px; color: #5f6368; }
    @media (prefers-color-scheme: dark) { .hint { color: #9aa0a6; } }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    button.act { font-size: 14px; padding: 9px 16px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; }
    .cancel { background: transparent; color: #1a73e8; }
    .cancel:hover { background: rgba(26,115,232,.1); }
    .ok { background: #1a73e8; color: #fff; }
    .ok:hover { background: #1765cc; }
  `;

  function showModal({ defaultTemplate, presets, values }) {
    return new Promise((resolve) => {
      document.getElementById("__dzn-host")?.remove();

      const host = document.createElement("div");
      host.id = "__dzn-host";
      const shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = CSS;

      const ctxNote =
        values.folder || values.count
          ? `フォルダ: ${values.folder ?? "-"} / 選択数: ${values.count ?? "-"}`
          : "Google Drive からダウンロードする ZIP の保存名を指定します";

      const presetChips = presets
        .map(
          (p, i) =>
            `<button class="chip" type="button" data-i="${i}">${escapeHtml(
              p.name
            )}</button>`
        )
        .join("");

      const overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.innerHTML = `
        <div class="dialog" role="dialog" aria-modal="true" aria-label="ZIPファイル名を入力">
          <h2>ZIPファイル名を入力</h2>
          <p class="sub">${escapeHtml(ctxNote)}</p>
          ${presetChips ? `<div class="presets">${presetChips}</div>` : ""}
          <div class="field">
            <input id="dzn-name" type="text" placeholder="例: 2026-07-24_納品データ" autocomplete="off" spellcheck="false">
            <span class="ext">.zip</span>
          </div>
          <p class="preview" id="dzn-preview"></p>
          <p class="hint">{date} {time} {datetime} {project} {folder} {count} が使えます</p>
          <div class="actions">
            <button class="act cancel" type="button">この名前を使わない</button>
            <button class="act ok" type="button">この名前で保存</button>
          </div>
        </div>
      `;

      shadow.append(style, overlay);
      (document.body || document.documentElement).appendChild(host);

      const input = shadow.getElementById("dzn-name");
      const preview = shadow.getElementById("dzn-preview");
      const okBtn = shadow.querySelector(".ok");
      const cancelBtn = shadow.querySelector(".cancel");

      input.value = expand(defaultTemplate, values);

      function renderPreview() {
        const raw = input.value.trim();
        preview.textContent = raw ? `→ ${expand(raw, values)}.zip` : "";
      }
      renderPreview();

      shadow.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const preset = presets[Number(chip.dataset.i)];
          if (preset) {
            input.value = preset.template;
            input.focus();
            renderPreview();
          }
        });
      });

      function cleanup() {
        document.removeEventListener("keydown", onKey, true);
        host.remove();
      }
      function confirm() {
        cleanup();
        resolve({ name: input.value });
      }
      function cancel() {
        cleanup();
        resolve({ cancelled: true });
      }
      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }

      okBtn.addEventListener("click", confirm);
      cancelBtn.addEventListener("click", cancel);
      overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) cancel();
      });
      input.addEventListener("input", renderPreview);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirm();
        }
      });
      document.addEventListener("keydown", onKey, true);

      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
})();
