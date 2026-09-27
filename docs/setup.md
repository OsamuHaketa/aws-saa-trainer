# クラウドへの公開手順（Phase 1）

[設計書](design.md) 12 章の 8〜11 の手順。所要時間は 30〜40 分ほど。

コマンドの `<…>` は自分の値に置き換える。ただし**トークン・シークレット・秘密鍵は、画面に表示したり、このファイルや他のファイルに貼ったりしない**（「秘密情報の扱い」の章）。ここでは本番の URL を `https://aws-saa-trainer.vercel.app` として書いているが、Vercel のプロジェクト名によって変わるので、実際の URL に読み替える。

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

# URL を確認する。トークンは控えずに、使うときにその場で作って環境変数に直接渡す（下の例）
turso db show saa-trainer-dev --url
turso db show saa-trainer-prod --url
```

スキーマを両方に適用する（このリポジトリで実行）。トークンは `$(…)` でその場で作り、1 日で期限が切れるようにする。

```bash
DATABASE_URL=$(turso db show saa-trainer-dev --url) DATABASE_AUTH_TOKEN=$(turso db tokens create saa-trainer-dev --expiration 1d) npm run db:migrate
DATABASE_URL=$(turso db show saa-trainer-prod --url) DATABASE_AUTH_TOKEN=$(turso db tokens create saa-trainer-prod --expiration 1d) npm run db:migrate
```

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
4. クライアント ID を控える。クライアント シークレットは控えずに、4 の手順で Vercel に直接登録する（画面を閉じても、あとから新しいシークレットを追加できる）

会社の Google Workspace のアカウントでログインしたい場合、Workspace の管理者が外部アプリを制限していると、ログインできないことがある。その場合は、当面は個人の Gmail を `ALLOWED_EMAILS` とテストユーザーに入れて使う（設計書 13 章）。

## 4. 環境変数を登録してプレビューで確認する

秘密情報は、作ったものを画面に出さずに、パイプで Vercel に直接登録する（`--sensitive` で、登録後は Vercel の画面でも値を読めなくなる。`tr -d '\n'` は末尾の改行を取るため）。

```bash
# DB のトークン
turso db tokens create saa-trainer-prod | tr -d '\n' | npx vercel env add DATABASE_AUTH_TOKEN production --sensitive
turso db tokens create saa-trainer-dev  | tr -d '\n' | npx vercel env add DATABASE_AUTH_TOKEN preview --sensitive
# 認証の秘密鍵（プレビュー用と本番用で別の値にする）
openssl rand -base64 32 | tr -d '\n' | npx vercel env add BETTER_AUTH_SECRET production --sensitive
openssl rand -base64 32 | tr -d '\n' | npx vercel env add BETTER_AUTH_SECRET preview --sensitive
# Google のクライアント シークレット（コピーしてから pbpaste で渡す。終わったらクリップボードを別の文字で上書きする）
pbpaste | tr -d '\n' | npx vercel env add GOOGLE_CLIENT_SECRET production --sensitive
pbpaste | tr -d '\n' | npx vercel env add GOOGLE_CLIENT_SECRET preview --sensitive
```

秘密情報でない値（URL・クライアント ID・許可するアドレス）は、Vercel の Settings → Environment Variables で登録してよい。**Production** と **Preview** で値が違うものは、それぞれの環境だけにチェックを入れて別々に登録する。

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
   export DATABASE_URL=$(turso db show saa-trainer-prod --url) DATABASE_AUTH_TOKEN=$(turso db tokens create saa-trainer-prod --expiration 1d)
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
| バックアップ | 週 1 回、本番に対して `DATABASE_URL=$(turso db show saa-trainer-prod --url) DATABASE_AUTH_TOKEN=$(turso db tokens create saa-trainer-prod --expiration 1d) npm run backup` |
| トークンを入れ替える | `scripts/rotate-db-token.sh`（「秘密情報の扱い」の章） |

## 秘密情報の扱い

このアプリの秘密情報は、Turso のトークン（`DATABASE_AUTH_TOKEN`）、認証の秘密鍵（`BETTER_AUTH_SECRET`）、Google のクライアント シークレット（`GOOGLE_CLIENT_SECRET`）の 3 つ。

### 置き場所

| 場所 | 置いてよいもの |
|---|---|
| Vercel の環境変数（Sensitive） | 本番とプレビューの値。登録後は誰も読めない |
| `.env.local`（Git 管理外・自分の PC だけ） | ローカルで使う値。できれば Turso は使わず `local.db` で開発する |
| 上以外（リポジトリのファイル・ドキュメント・チャット・AI への入力・スクリーンショット） | **置かない**。コマンドの例は `$(turso db tokens create …)` の形で書く |

### 流出を防ぐ仕組み

| 仕組み | 内容 |
|---|---|
| `.gitignore` | `.env*`（`.env.example` 以外）・`backups/`・`.vercel` を Git に入れない |
| コミット前のチェック（`.githooks/pre-commit`） | コミットする内容を gitleaks で調べ、トークンや鍵らしきものがあればコミットを止める。`.env` のファイルは `git add -f` しても止める |
| push 前のチェック（`.githooks/pre-push`） | push するコミットを gitleaks で調べ直す（`--no-verify` でコミットのチェックを飛ばした場合に備える） |
| GitHub Actions（`.github/workflows/secret-scan.yml`） | push のたびに全履歴を調べる。フックを入れていない環境から push した場合でも気づける |
| ルール（`.gitleaks.toml`） | gitleaks の標準のルールに、このアプリの 3 つの秘密情報・トークン付きの libSQL の URL・Google のシークレットを足している |
| リポジトリ | private。GitHub の設定で public にしない |

フックは `npm install` で自動で有効になる（`prepare` が `git config core.hooksPath .githooks` を実行する）。gitleaks は `brew install gitleaks` で入れる（入っていないとコミットと push が止まる）。

誤検知のときは、その行の末尾に `gitleaks:allow` と書いたコメントを付ける。`.gitleaksignore` に書いてよいのは、すでに無効にした（作り直した）値だけ。

### 流出したとき

1. **すぐに作り直す**（ファイルから消すだけでは足りない。Git の履歴や、見た人の手元に残る）
2. Turso のトークン: `scripts/rotate-db-token.sh`。DB の署名の鍵をローテーションして古いトークンをすべて無効にし、新しいトークンを画面に出さずに Vercel に登録して、本番とプレビューをデプロイし直す（切り替えの間、1〜2 分ほど DB に接続できない）。ローカルの `.env.local` で Turso を使っているなら、続けて `scripts/rotate-db-token.sh env-local`
   - `turso group tokens invalidate` は「成功」と表示されても、古いトークンが使え続けた（2026-09、aws- のリージョンの DB）。スクリプトは Platform API で DB ごとにローテーションしている
3. `BETTER_AUTH_SECRET`: `openssl rand -base64 32 | tr -d '\n' | npx vercel env add BETTER_AUTH_SECRET production --force --sensitive` のあと、本番をデプロイし直す（全員がログアウトされる）
4. `GOOGLE_CLIENT_SECRET`: Google Cloud の「クライアント」で新しいシークレットを追加 → 上と同じように Vercel に登録してデプロイし直す → 古いシークレットを無効にする
5. 古い値で接続できないことを確かめる
