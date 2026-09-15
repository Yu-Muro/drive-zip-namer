# Privacy Policy / プライバシーポリシー

**Drive Zip Namer** (last updated: 2026-09-15)

## 日本語

Drive Zip Namer は、ユーザーのプライバシーを尊重します。

- 本拡張機能は、ユーザーが入力した ZIP ファイル名と設定を **ブラウザ内
  （`chrome.storage.local`）にのみ** 保存します。
- 分割 ZIP の一時的な命名状態はブラウザセッション内（`chrome.storage.session`）に
  保存し、ブラウザを終了すると削除されます。
- ダウンロードされるファイルの **内容を読み取りません**。変更するのは保存時の
  ファイル名のみです。
- いかなるデータも **外部サーバーへ送信しません**。アナリティクス・トラッキングは
  一切含まれていません。
- `downloads` 権限は Google Drive 由来の ZIP ダウンロードの保存名を変更するためだけに
  使用します。
- `scripting` 権限は、拡張機能の導入・更新前から開いていた Google Drive タブに
  ファイル名入力画面を読み込むためだけに使用します。
- `https://drive.google.com/*` のホスト権限は、動作対象を Google Drive に限定するために
  使用します。

拡張機能を削除すると、保存されたデータもすべて削除されます。

## English

Drive Zip Namer respects your privacy.

- The extension stores the ZIP filenames you enter and your settings **only inside
  your browser** (`chrome.storage.local`).
- Temporary naming state for split ZIP downloads is stored in the browser session
  (`chrome.storage.session`) and is removed when the browser exits.
- It **never reads the contents** of downloaded files. It only changes the filename
  used when saving.
- It sends **no data to any external server**. There are no analytics or tracking.
- The `downloads` permission is used solely to rename ZIP downloads that originate
  from Google Drive.
- The `scripting` permission is used solely to load the filename dialog into Google
  Drive tabs that were already open when the extension was installed or updated.
- The `https://drive.google.com/*` host permission limits the extension's scope to
  Google Drive.

Removing the extension deletes all stored data.

## Contact

Please open an issue on the GitHub repository:
https://github.com/Yu-Muro/drive-zip-namer/issues
