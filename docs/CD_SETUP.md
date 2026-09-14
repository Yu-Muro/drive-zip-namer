# Chrome Web Store CD セットアップ

`v1.2.3` 形式の Git タグを push すると、GitHub Actions が配布 ZIP を検査・生成して
Chrome Web Store にアップロードする。その後、GitHub の承認を経て審査へ提出し、
Chrome の審査に通過すると自動公開される。

## 1. Google Cloud と Chrome Web Store の接続

1. Google Cloud で専用プロジェクトを作成する。
2. **Chrome Web Store API**、**IAM API**、**IAM Service Account Credentials API**、
   **Security Token Service API** を有効にする。
3. CD 専用サービスアカウントを作成する。Google Cloud 側のプロジェクトロールは不要。
4. Chrome Web Store Developer Dashboard の **Account** で、サービスアカウントの
   メールアドレスを追加する。Publisher に追加できるサービスアカウントは1個まで。

API とサービスアカウントは次のコマンドで作成できる。

```sh
gcloud services enable \
  chromewebstore.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project="drive-zip-namer"

gcloud iam service-accounts create chrome-web-store-publisher \
  --project="drive-zip-namer" \
  --display-name="Chrome Web Store Publisher"
```

公式手順:

- <https://developer.chrome.com/docs/webstore/service-accounts>
- <https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account>

## 2. Workload Identity Federation

長期のサービスアカウント鍵は作らず、GitHub Actions の OIDC トークンから短期アクセス
トークンを発行する。このプロジェクトでは次の値を使用する。

```sh
gcloud iam workload-identity-pools create github \
  --project="drive-zip-namer" \
  --location="global" \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc drive-zip-namer \
  --project="drive-zip-namer" \
  --location="global" \
  --workload-identity-pool="github" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'Yu-Muro/drive-zip-namer' && assertion.ref.startsWith('refs/tags/v')"

gcloud iam service-accounts add-iam-policy-binding \
  "chrome-web-store-publisher@drive-zip-namer.iam.gserviceaccount.com" \
  --project="drive-zip-namer" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/606434867453/locations/global/workloadIdentityPools/github/attribute.repository/Yu-Muro/drive-zip-namer"
```

Provider の完全名は次のコマンドで取得する。

```sh
gcloud iam workload-identity-pools providers describe drive-zip-namer \
  --project="drive-zip-namer" \
  --location="global" \
  --workload-identity-pool="github" \
  --format="value(name)"
```

## 3. 公開先

GitHub リポジトリの **Settings → Secrets and variables → Actions → Variables** で、
次の Repository Variables を設定する。

| 変数名 | 設定する値 |
| --- | --- |
| `GCP_PROJECT_ID` | Google Cloud のプロジェクト ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Provider の完全名 |
| `GCP_SERVICE_ACCOUNT` | Chrome Web Store に登録したサービスアカウントのメールアドレス |
| `CHROME_WEB_STORE_PUBLISHER_ID` | Developer Dashboard に表示される Publisher ID |
| `CHROME_WEB_STORE_EXTENSION_ID` | 公開対象の拡張機能 ID |

これらは認証情報ではないため Repository Secrets ではなく Variables として管理する。
アクセストークンは Workload Identity Federation により実行時に短期発行されるため、
リポジトリには保存しない。

## 4. 公開承認の設定

GitHub リポジトリの **Settings → Environments** で
`chrome-web-store-production` を作成し、**Required reviewers** に公開承認者を設定する。
自分でタグを作成して自分で承認する運用なら、自己承認の禁止は有効にしない。

承認前に ZIP は Chrome Web Store の下書きへアップロードされる。承認すると審査へ提出され、
API の `DEFAULT_PUBLISH` 指定により審査通過後に自動公開される。

## 5. リリース方法

1. `manifest.json` と `package.json` のバージョンを同じ値へ更新する。
2. 変更を `main` にマージし、CI が成功していることを確認する。
3. `main` の対象コミットへ同じバージョンのタグを付けて push する。

```sh
git switch main
git pull --ff-only
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

GitHub Actions の **Release to Chrome Web Store** を開き、`Submit for review and automatic
publishing` が承認待ちになったら、アップロード結果を確認して承認する。

## 制約

- タグは `v数字.数字.数字` 形式のみ。
- タグ、`manifest.json`、`package.json` のバージョンが一致しない場合は停止する。
- タグのコミットが `main` に含まれていない場合は停止する。
- Chrome Web Store の公開範囲を変更した直後は、最初の1回を Developer Dashboard から
  手動公開しないと API 公開できない場合がある。
