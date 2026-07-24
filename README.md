# Drive Zip Namer

Google Drive で複数ファイルを選択してダウンロードしたときに生成される ZIP ファイル
（`drive-download-20260724T031500Z-001.zip` のような自動命名）を、**自分で決めた名前で保存できる** Chrome 拡張機能です。

<p align="center">
  <img src="assets/icon-128.png" alt="Drive Zip Namer icon" width="96">
</p>

## 使い方

### A. ダウンロード時に名前を決める（おすすめ）

1. Google Drive で複数ファイルを選択して「ダウンロード」を実行する
2. ZIP のダウンロードが始まると、**ファイル名を入力するダイアログ**が表示される
3. 名前（例: `2026-07-24_納品データ`）を入力して **「この名前で保存」** を押す
4. 指定した名前で保存される

対象は Google Drive の **一括ダウンロード（ZIP）** のみです。単一ファイルの
ダウンロードや他サイトのダウンロードには影響しません。ダイアログは拡張機能の
オプションからオフにできます。

### B. あらかじめ名前を予約しておく

1. ツールバーの Drive Zip Namer アイコンをクリックし、ZIP ファイル名を入力して
   **「次の Drive ダウンロードに適用」** を押す
2. いつもどおり Google Drive の「ダウンロード」を実行する
3. 指定した名前で保存される（ダイアログは出ません）

予約した名前は **5 分間** だけ有効です。使われるか期限が切れると自動でクリアされます。

### テンプレート変数

ファイル名には次の変数が使えます（適用ボタンを押した時点の日時で展開されます）。

| 変数 | 例 |
| --- | --- |
| `{date}` | `2026-07-24` |
| `{time}` | `1430` |
| `{datetime}` | `2026-07-24_1430` |

### 分割 ZIP への対応

ファイルが多い・大きい場合、Google Drive は ZIP を複数に分割することがあります。
その場合は最初の ZIP から 30 秒間、同じ名前に `_part2`, `_part3` … を付けて保存します
（設定でオフにできます）。

### 設定

拡張機能の「オプション」から変更できます。

- 保存先サブフォルダ（ダウンロードフォルダ内）
- 同名ファイルがあるときの動作（自動連番 / 上書き / 確認）
- 分割 ZIP 対応のオン・オフ

## インストール（開発版）

1. このリポジトリをクローンまたは [Releases](../../releases) から ZIP をダウンロードして展開する
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパー モード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択する

## 仕組みと権限

Google Drive の ZIP 生成には一切介入しません。Chrome が保存ファイル名を決定するタイミング
（`chrome.downloads.onDeterminingFilename`）で、Google Drive 由来の ZIP
（URL が `drive.google.com` / `googleusercontent.com` 系で拡張子が `.zip`）だけを対象に
保存名を差し替えます。ダウンロード時のダイアログ表示には、Drive ページに読み込まれる
content script が自前のモーダル（Shadow DOM）を表示します。Drive の DOM 構造には依存しません。

| 権限 | 用途 |
| --- | --- |
| `downloads` | 保存ファイル名の差し替え |
| `storage` | 入力したファイル名・設定の保存（ローカルのみ） |
| `https://drive.google.com/*` | 対象を Google Drive に限定 |

ダウンロード内容の読み取りや外部送信は行いません。詳細は [PRIVACY.md](PRIVACY.md) を参照してください。

## 開発

```bash
# ユニットテスト
npm test

# アイコン生成
node scripts/generate-icons.mjs

# 配布用 ZIP の作成（dist/drive-zip-namer-<version>.zip）
npm run package
```

### ディレクトリ構成

```
drive-zip-namer/
├── manifest.json          # Manifest V3
├── background.js          # service worker（ダウンロード名の差し替え）
├── content/               # Drive ページに出す名前入力モーダル
├── popup/                 # ツールバーのポップアップ
├── options/               # 設定画面
├── lib/                   # 純粋関数（サニタイズ・判定・テンプレート）
├── assets/                # アイコン
├── scripts/               # アイコン生成・パッケージング
└── test/                  # node:test によるユニットテスト
```

## ライセンス

[MIT](LICENSE)
