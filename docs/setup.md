# クラウドへの公開手順（Phase 1）

[設計書](design.md) 12 章の 8〜11 の手順。所要時間は 30〜40 分ほど。

コマンドの `<…>` は自分の値に置き換える。ここでは本番の URL を `https://aws-saa-trainer.vercel.app` として書いているが、Vercel のプロジェクト名によって変わるので、実際の URL に読み替える。

## 0. 流れ

```text
1. Turso に DB を 2 つ作る（dev / prod）→ スキーマを適用
2. Vercel にリポジトリをつなぐ → URL が決まる
3. Google Cloud で OAuth クライアントを作る（2 の URL を登録）
4. Vercel に環境変数を登録 → develop のプレビューで確認
5. main にマージして本番に出す
6. local.db の記録を本番に移す
7. Android のホーム画面に追加する
```

## 1. Turso（DB）

```bash
# turso は別の tap の sqld に依存している。最近の Homebrew は、信頼した tap からしか読み込まない
brew tap libsql/sqld
brew trust libsql/sqld     # tursodatabase/tap でも同じエラーが出たら brew trust tursodatabase/tap も
brew install tursodatabase/tap/turso
# Homebrew で入らないときは: curl -sSfL https://get.tur.so/install.sh | bash（~/.turso に入る）
turso auth signup          # アカウントがあれば turso auth login

turso db locations         # 東京のコード（aws-ap-northeast-1 など）を確認
turso db create saa-trainer-dev  --location <東京のコード>
turso db create saa-trainer-prod --location <東京のコード>

# URL とトークン（それぞれ控えておく）
turso db show saa-trainer-dev --url
turso db tokens create saa-trainer-dev
turso db show saa-trainer-prod --url
turso db tokens create saa-trainer-prod
```

スキーマを両方に適用する（このリポジトリで実行）。

```bash
DATABASE_URL=<dev の URL> DATABASE_AUTH_TOKEN=<dev のトークン> npm run db:migrate
DATABASE_URL=<prod の URL> DATABASE_AUTH_TOKEN=<prod のトークン> npm run db:migrate
```

DATABASE_URL=libsql://saa-trainer-dev-osamuhaketa.aws-ap-northeast-1.turso.io DATABASE_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTAzODE3MjksImlkIjoiMDFhMGRiMGQtOGQwMS03ZTRlLTllYWQtNTc3YjUzNGRlYjA5Iiwia2lkIjoiUldKVVU2TFktaWY0M2pzWDRYWEFZbHRoNC1MVU5GU1l4Zy1pRW45SXFuUSIsInJpZCI6IjIxZDMyZTczLWEzM2MtNDMyZS05OWE0LTA2Y2E0YmVmM2NjYSJ9.rQ3Ci0wUpR_oo3OyF24vu5eoztkOhYvmMnp2LbOJVHKgpwxK_NmoApIWjSjfxT88zi0yRS-rIUNgHaWnUdeNAA npm run db:migrate
DATABASE_URL=libsql://saa-trainer-prod-osamuhaketa.aws-ap-northeast-1.turso.io DATABASE_AUTH_TOKEN=eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTAzODE4MzEsImlkIjoiMDFhMGRiMGUtMzkwMS03ZTFiLThkYzQtOGQ0MWExNmQ5ZjEwIiwia2lkIjoiUldKVVU2TFktaWY0M2pzWDRYWEFZbHRoNC1MVU5GU1l4Zy1pRW45SXFuUSIsInJpZCI6ImQ2MTQ3YjQ3LTRiOTYtNDQwYy1hNTI3LTQ4OWRkMmJiMTQzYiJ9.BB2RWBX9nmFDZ8_C1YTFa3WWKw4_-B3T8EKIPR9i9jP5GGLQOa21T5eC8cyaFlXqH_jVjkiBCPsIS3SF7u5MCA npm run db:migrate

外部キーが効くかを確認する（設計書 6.2 の未確認事項）。`1` なら問題ない。`0` なら教えてほしい。

```bash
turso db shell saa-trainer-prod "pragma foreign_keys"
```

## 2. Vercel（ホスティング）

1. https://vercel.com に GitHub アカウントでサインアップ（Hobby プラン）
2. 「Add New… → Project」で `OsamuHaketa/aws-saa-trainer` を選ぶ（private リポジトリへのアクセスを許可する）
3. Framework は Next.js のまま。環境変数はまだ入れずに「Deploy」（ここでの初回のデプロイは、ログインできなくても構わない）
4. プロジェクトの Settings で次を設定する
   - **Git → Production Branch**: `main`
   - 関数のリージョン（東京 `hnd1`）は、リポジトリの `vercel.json` で指定してあるので設定不要
5. URL を控える
   - 本番: Settings → Domains に出ている `https://<プロジェクト名>.vercel.app`
   - プレビュー（develop 用の固定の URL）: `https://<プロジェクト名>-git-develop-<チーム名>.vercel.app`。develop に push したあと、Deployments で Branch が develop のデプロイを開くと「Domains」に表示される（ランダムな文字が入っていない方）。Google Cloud にはあとから追加してよい

## 3. Google Cloud（ログイン）

1. https://console.cloud.google.com で新しいプロジェクトを作る（例: `saa-trainer`）
2. 「Google Auth Platform」を開いて設定する
   - **ブランディング**: アプリ名 `AWS Decision Trainer`、サポートのメールアドレス
   - **対象（Audience）**: ユーザーの種類は「外部」、公開ステータスは「テスト」のまま。**テストユーザーに自分のアドレスを追加する**
   - **データアクセス**: スコープは追加しない（既定の `openid`・`email`・`profile` だけで足りる）
3. 「クライアント → クライアントを作成」で、種類は「ウェブ アプリケーション」
   - **承認済みの JavaScript 生成元**
     - `http://localhost:3000`
     - `https://aws-saa-trainer.vercel.app`
     - `https://aws-saa-trainer-git-develop-<チーム名>.vercel.app`
   - **承認済みのリダイレクト URI**（上の 3 つの末尾に `/api/auth/callback/google` を付けたもの）
     - `http://localhost:3000/api/auth/callback/google`
     - `https://aws-saa-trainer.vercel.app/api/auth/callback/google`
     - `https://aws-saa-trainer-git-develop-<チーム名>.vercel.app/api/auth/callback/google`
4. クライアント ID とクライアント シークレットを控える

会社の Google Workspace のアカウントでログインしたい場合、Workspace の管理者が外部アプリを制限していると、ログインできないことがある。その場合は、当面は個人の Gmail を `ALLOWED_EMAILS` とテストユーザーに入れて使う（設計書 13 章）。

## 4. 環境変数を登録してプレビューで確認する

秘密鍵を 2 つ作る（プレビュー用と本番用で別の値にする）。

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Vercel の Settings → Environment Variables で登録する。**Production** と **Preview** で値が違うものは、それぞれの環境だけにチェックを入れて別々に登録する。

| 変数 | Production | Preview |
|---|---|---|
| `DATABASE_URL` | prod の URL | dev の URL |
| `DATABASE_AUTH_TOKEN` | prod のトークン | dev のトークン |
| `BETTER_AUTH_SECRET` | 秘密鍵 1 | 秘密鍵 2 |
| `BETTER_AUTH_URL` | `https://aws-saa-trainer.vercel.app` | `https://aws-saa-trainer-git-develop-<チーム名>.vercel.app`（ブランチを `develop` に限定して登録） |
| `GOOGLE_CLIENT_ID` | クライアント ID | 同じ |
| `GOOGLE_CLIENT_SECRET` | クライアント シークレット | 同じ |
| `ALLOWED_EMAILS` | 自分のアドレス | 同じ |

登録したら、Deployments で develop の最新のデプロイを「Redeploy」する（環境変数は、デプロイし直したときに反映される）。

確認すること:

- プレビューの URL を開くと `/login` に飛ぶ → 「Google でログイン」→ ホームが表示される
- 学習画面で数問解き、分析画面に回答数が出る
- 許可していないアカウントでログインすると「このアカウントでは利用できません」と出る
- ヘッダーの「ログアウト」でログイン画面に戻る

プレビューには Vercel の保護（Vercel にログインしている人しか見られない）が既定でかかっている。自分のブラウザで見る分には、そのままでよい。

## 5. 本番に出す

```bash
git switch main
git merge develop
git push origin main
```

Vercel が本番に自動でデプロイする。本番の URL で、4 と同じ確認をする。

**本番ではまだ学習しない**（6 の取り込みが終わるまで）。取り込み先のユーザーに記録があると、取り込みは中止される。

## 6. local.db の記録を本番に移す

1. 本番の URL に 1 回ログインする（自分のユーザーが作られる）
2. ローカルの記録を書き出す

   ```bash
   npm run backup                 # → backups/<日時>/
   ```

3. 書き込まずに確認してから、本番に取り込む

   ```bash
   export DATABASE_URL=<prod の URL> DATABASE_AUTH_TOKEN=<prod のトークン>
   npm run import-records -- --from backups/<日時> --to-email <自分のアドレス> --dry-run
   npm run import-records -- --from backups/<日時> --to-email <自分のアドレス>
   ```

   「✓ 件数が一致」と出れば成功。

4. 本番のホーム（復習待ち・学習中）と分析画面（回答数・正答率）が、ローカルの `npm run dev` で見たときと同じか確認する
5. 本番の最初のバックアップを取る（`DATABASE_URL` などは 3 のまま）

   ```bash
   npm run backup
   ```

以後の学習は本番で行う。`local.db` は開発用として残しておいてよい（マイグレーション前の状態は `local.db.before-users` に取ってある）。

## 7. Android のホーム画面に追加する

1. Android の Chrome で本番の URL を開き、ログインする
2. 右上のメニュー（︙）→「ホーム画面に追加」または「アプリをインストール」
3. ホーム画面のアイコンから開くと、アドレスバーのない単独のアプリとして学習画面が開く

PC でも同じアカウントでログインすれば、記録は共通になる。

## 以後の運用

| やること | 手順 |
|---|---|
| 問題を直す | `generated/*.json` を編集 → `npm run validate` → develop に push（プレビューで確認）→ main にマージ |
| スキーマを変える | `npm run db:generate` → 本番のバックアップ → dev と prod に `npm run db:migrate` → デプロイ（後方互換にする。設計書 6.3） |
| バックアップ | 週 1 回、本番に対して `npm run backup` |
