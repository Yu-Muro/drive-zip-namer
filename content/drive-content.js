// Drive Zip Namer - content script
// Google Drive のページ上で、拡張機能(service worker)からの依頼を受けて
// 「ZIPファイル名を入力するモーダル」を表示する。
//
// Drive の DOM 構造には依存しない。自前の overlay を Shadow DOM で差し込むだけなので、
// Drive 側の画面変更に強い。

(() => {
  if (window.__driveZipNamerInjected) return;
  window.__driveZipNamerInjected = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DZN_PROMPT_ZIP_NAME") {
      showModal(message.defaultName || "").then(sendResponse);
      return true; // sendResponse を非同期で呼ぶ
    }
    return false;
  });

  const CSS = `
    :host { all: initial; }
    .overlay {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: center; justify-content: center;
      background: rgba(32, 33, 36, 0.5);
      font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    }
    .dialog {
      width: min(420px, calc(100vw - 48px));
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
    .field { display: flex; align-items: center; gap: 8px; }
    .field input {
      flex: 1; padding: 10px 12px; font-size: 14px;
      border: 1px solid #dadce0; border-radius: 8px; outline: none;
    }
    .field input:focus { border-color: #1a73e8; box-shadow: 0 0 0 1px #1a73e8; }
    .ext { color: #5f6368; font-size: 14px; }
    .hint { margin: 8px 0 0; font-size: 11px; color: #5f6368; }
    @media (prefers-color-scheme: dark) { .hint { color: #9aa0a6; } }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    button {
      font-size: 14px; padding: 9px 16px; border-radius: 8px;
      border: none; cursor: pointer; font-family: inherit;
    }
    .cancel { background: transparent; color: #1a73e8; }
    .cancel:hover { background: rgba(26,115,232,.1); }
    .ok { background: #1a73e8; color: #fff; }
    .ok:hover { background: #1765cc; }
  `;

  function showModal(defaultName) {
    return new Promise((resolve) => {
      // 既存モーダルがあれば消す
      document.getElementById("__dzn-host")?.remove();

      const host = document.createElement("div");
      host.id = "__dzn-host";
      const shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = CSS;

      const overlay = document.createElement("div");
      overlay.className = "overlay";
      overlay.innerHTML = `
        <div class="dialog" role="dialog" aria-modal="true" aria-label="ZIPファイル名を入力">
          <h2>ZIPファイル名を入力</h2>
          <p class="sub">Google Drive からダウンロードする ZIP の保存名を指定します</p>
          <div class="field">
            <input id="dzn-name" type="text" placeholder="例: 2026-07-24_納品データ" autocomplete="off" spellcheck="false">
            <span class="ext">.zip</span>
          </div>
          <p class="hint">{date} {time} {datetime} が使えます</p>
          <div class="actions">
            <button class="cancel" type="button">この名前を使わない</button>
            <button class="ok" type="button">この名前で保存</button>
          </div>
        </div>
      `;

      shadow.append(style, overlay);
      (document.body || document.documentElement).appendChild(host);

      const input = shadow.getElementById("dzn-name");
      const okBtn = shadow.querySelector(".ok");
      const cancelBtn = shadow.querySelector(".cancel");

      input.value = defaultName;

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
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirm();
        }
      });
      document.addEventListener("keydown", onKey, true);

      // 描画後にフォーカス
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  }
})();
