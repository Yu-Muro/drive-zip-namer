# Chrome Web Store 掲載用テキスト（下書き）

Chrome Web Store への公開はデベロッパーダッシュボード
（https://chrome.google.com/webstore/devconsole）から手動で行う。
初回のみ $5 の開発者登録料が必要。`npm run package` で作った
`dist/drive-zip-namer-<version>.zip` をアップロードする。

## 表示名

Drive Zip Namer - Rename Google Drive ZIP Downloads

## 概要（短い説明・132字以内）

Google Driveの一括ダウンロードで生成されるZIPファイルを、自分で決めた名前で保存できます。

## 詳細説明

Google Driveで複数ファイルを選択してダウンロードすると、
「drive-download-20260724T031500Z-001.zip」のような自動命名のZIPが保存されます。

Drive Zip Namer を使えば、ダウンロード前にファイル名を指定しておくだけで、
「2026-07-24_納品データ.zip」のようなわかりやすい名前で保存できます。

主な機能：
- Driveの一括ダウンロード（ZIP）開始時に、その場でファイル名を入力するダイアログを表示
- ポップアップでZIPファイル名を事前に指定（5分間有効・使用後は自動クリア）
- {date} {time} {datetime} {project} {folder} {count} のテンプレート変数に対応
- 現在のDriveフォルダ名・選択ファイル数を自動でファイル名に反映
- 案件別プリセットを保存してワンクリック命名
- 設定とプリセットのエクスポート/インポート（チームでの命名ルール共有）
- 分割ZIPにも対応（同じ名前 + _part2, _part3…）
- 保存先サブフォルダの指定
- 同名ファイルは自動連番で回避
- 直近の命名履歴からワンクリックで再利用

対象はGoogle Drive由来のZIPダウンロードのみです。
他サイトのダウンロードには影響しません。

## 権限の使用目的（審査向け）

- downloads: Google Driveからダウンロードされる ZIP ファイルの保存名を変更するために
  使用します。ダウンロード内容の読み取りや外部送信は行いません。
- storage: ユーザーが入力したファイル名と設定をブラウザ内に保存するために使用します。
- host permission (drive.google.com): 動作対象を Google Drive に限定し、ダウンロード時の
  ファイル名入力ダイアログを Drive ページ上に表示するために使用します。

## カテゴリ

仕事効率化 (Productivity)

## プライバシーポリシー URL

https://github.com/Yu-Muro/drive-zip-namer/blob/main/PRIVACY.md
