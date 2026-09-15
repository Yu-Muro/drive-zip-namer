# 公開手順（Chrome Web Store）

Drive Zip Namer を Chrome Web Store に公開・更新するための手順書。
掲載テキストは [store-listing.md](store-listing.md)、ストア画像は [`../assets/store/`](../assets/store/) を使う。

公開後のバージョン更新は GitHub Actions で自動化している。初期設定と通常の更新手順は
[CD_SETUP.md](CD_SETUP.md) を参照する。この文書の手動手順は初回公開と障害時の代替手段として残す。

> 初回のデベロッパー登録・$5 の支払い・掲載情報の設定は、ダッシュボードでの手動操作が必要です。

---

## 0. 事前チェック

- [ ] `npm test` が通る（CI でも自動確認）
- [ ] `npm run validate`（manifest ↔ package.json のバージョン整合など）
- [ ] `npm run release:check` が通る（構文・配布ZIP内容を含む全検査）
- [ ] `manifest.json` / `package.json` の `version` を今回の公開版に更新済み
- [ ] `npm run package` で `dist/drive-zip-namer-<version>.zip` を生成
      （`assets/store/` は同梱されない＝ストア画像は拡張機能に含めない）

## 1. デベロッパー登録（初回のみ）

1. [Chrome Web Store デベロッパーダッシュボード](https://chrome.google.com/webstore/devconsole) に Google アカウントでログイン
2. 登録料 **$5（1 回きり）** を支払う
3. 発行元情報（連絡先メール）を登録・確認する

## 2. 提出用アセット

| アセット | 要件 | ファイル |
| --- | --- | --- |
| 拡張機能パッケージ | manifest がルートにある ZIP | `dist/drive-zip-namer-<version>.zip` |
| ストアアイコン | 128×128 PNG | `assets/icon-128.png` |
| スクリーンショット | 1280×800 PNG（最低 1・最大 5） | `assets/store/store-1.png`〜`store-3.png` |
| 小さいプロモタイル | 440×280 PNG（任意・推奨） | `assets/store/promo-small-tile.png` |
| プライバシーポリシー URL | 公開 URL | <https://github.com/Yu-Muro/drive-zip-namer/blob/main/PRIVACY.md> |

スクリーンショット/プロモタイルは再生成可能（[6. アセットの再生成](#6-アセットの再生成) 参照）。

## 3. ストア掲載情報

[store-listing.md](store-listing.md) の内容をそのまま使う。

- 表示名: **Drive Zip Namer - Rename Google Drive ZIP Downloads**
- カテゴリ: **仕事効率化（Productivity）**
- 言語: 日本語（英語説明も併記）
- 短い説明・詳細説明: store-listing.md を参照

## 4. データとプライバシーの申告（審査で必須）

ダッシュボードの「プライバシー」タブで以下を入力する。

**単一用途（Single purpose）**

> Google Drive の一括ダウンロードで生成される ZIP ファイルの保存名を、
> ユーザーが指定した名前に変更する。

**権限の正当性（Permission justification）**

- `downloads` — Google Drive 由来の ZIP ダウンロードの保存名を変更するため
- `scripting` — 導入・更新前から開いていた Google Drive タブにも名前入力画面を
  読み込むため
- `storage` — 入力したファイル名・設定・プリセットをローカルに保存するため
- host permission (`drive.google.com`) — 対象を Google Drive に限定し、
  ダウンロード時の名前入力ダイアログを Drive ページ上に表示するため

**データ利用**

- ユーザーデータの収集・外部送信: **なし**（アナリティクス・トラッキングなし）
- 「データを第三者に販売しない」「承認された用途以外に使用しない」等の開示ポリシーに同意

## 5. アップロード〜公開

1. ダッシュボード →「新しいアイテム」→ `dist/drive-zip-namer-<version>.zip` をアップロード
2. 2〜4 の情報を入力
3. 公開範囲を選ぶ（まず **限定公開/非公開でテスト → 一般公開** が安全）
4. 「審査に送信」→ 審査通過後に公開（通常数時間〜数日）

## 6. アセットの再生成

スクリーンショットとプロモタイルは、`assets/store/` の PNG を差し替えれば更新できる。
（生成に使ったマーケ用 HTML はリポジトリに含めていない。文言や配色を変える場合は
1280×800 / 440×280 の HTML を用意し、ヘッドレスブラウザで同サイズのビューポートを
撮影して差し替える。サイズは Chrome Web Store の要件どおり厳密に。）

## 7. バージョンアップ時の更新フロー

1. コード修正 → `manifest.json` と `package.json` の `version` を上げる
   （CI の `validate` が不一致を検知する）
2. `main` にマージして CI の成功を確認する
3. `vX.Y.Z` タグを push する
4. GitHub Actions が ZIP を検査・アップロードした後、公開環境を承認する
5. Chrome Web Store の審査通過後に自動公開される

CD を使用できない場合は、`npm run package` で新しい ZIP を作成し、Developer Dashboard
からアップロード・審査提出する。

---

## チェックリスト（提出直前）

- [ ] バージョンを更新し、`npm test` / `npm run validate` が緑
- [ ] `dist/…zip` を再生成した（最新コードが入っている）
- [ ] スクリーンショット 1〜5 枚（1280×800）とアイコン（128×128）を用意
- [ ] プライバシーポリシー URL を設定
- [ ] 単一用途・権限の正当性・データ利用を記入
- [ ] まず限定公開でテスト
- [ ] `V1_RELEASE_CHECKLIST.md` の実環境スモークテストを完了
