# AWS Decision Trainer

AWS SAA の知識を **Knowledge Atom**（最小の知識単位）に分解し、そこから作った 4 択問題を FSRS の間隔反復で回す学習アプリ。Google でログインし、学習記録はユーザーごとに保存する。クラウド化の設計は [docs/design.md](docs/design.md)、公開の手順は [docs/setup.md](docs/setup.md)。

## 使い方

```bash
brew install gitleaks   # 秘密情報のチェックに使う（ないとコミットと push が止まる）
npm install             # Git のフック（.githooks/）もここで有効になる
npm run dev             # http://localhost:3000
```

**秘密情報（DB のトークン・認証の秘密鍵・Google のシークレット）は、リポジトリのファイルに書かない。** 置き場所は Vercel の環境変数と `.env.local` だけ。コミット前・push 前・GitHub Actions で gitleaks が調べ、見つかれば止める。扱い方と、流出したときの作り直し方（`scripts/rotate-db-token.sh`）は [docs/setup.md の「秘密情報の扱い」](docs/setup.md#秘密情報の扱い)。

初回起動時に `local.db`（学習履歴、Git 管理外）が自動で作られる。

ローカルでは、何も設定しなければ**ログインせずに使える**（ローカル専用モード。記録はユーザー `local-owner` に保存される）。開発サーバー・ローカルの DB・`GOOGLE_CLIENT_ID` が未設定、の 3 つがそろったときだけ有効で、本番のビルドでは必ず無効になる。Google ログインを試すときは、`.env.example` を `.env.local` にコピーして値を入れる。

| 画面 | 内容 |
|---|---|
| `/` | 今日の復習待ち・新規の残り・正答率 |
| `/study` | 学習。キーボード: `1`〜`4` 回答 / `Enter` 次へ / `G` 勘だった / `Q W E R T` 間違えた理由 |
| `/dashboard` | カテゴリ別・問題タイプ別の正答率、混同ペア、苦手な Atom |
| `/knowledge` | サービスの一覧。サービスを選ぶと、図解（構成図・比較表・判断フロー・流れ図）、見分け方・キーワード早見表・関係（Atom から自動で作る）、用語カード（facts、各問題の最新結果）を 1 ページで見られる |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run validate` | Atom・問題・図解の検証（スキーマ、参照切れ、正解だけ長い選択肢、問題文に答えが含まれる、図のはみ出し など） |
| `npm run build-content` | Atom・問題・図解を `.generated/content.json` にまとめる。本番のアプリはこのファイルだけを読む（`npm run build` の前に validate と一緒に自動で実行される） |
| `npm run backup` | 学習記録（user・cards・review_logs・followups）を `backups/<日時>/` に JSON で書き出す。Turso なら `DATABASE_URL` と `DATABASE_AUTH_TOKEN` を指定する |
| `npm run import-records -- --from backups/<日時> --to-email <メール>` | バックアップから 1 人分の記録を、別の DB のユーザーに取り込む（移行・復元用。`--dry-run` あり） |
| `npm test` | 出題ロジックと図解の検証のテスト |
| `npm run typecheck` | 型チェック |
| `npm run db:generate` | `lib/db/schema.ts` を変えたあとにマイグレーションを作る（ローカルの DB には起動時に自動適用） |
| `npm run db:migrate` | マイグレーションを適用する。Turso に適用するときは `DATABASE_URL` と `DATABASE_AUTH_TOKEN` を指定する |
| `scripts/deploy.sh` | develop を本番に出す。型・テスト・問題データを確認し、未適用のマイグレーションがあれば本番のバックアップ → dev と prod に適用してから、develop と main を push して本番のデプロイを待つ。トークンは中で作って画面に出さない（`--migrate-only` でマイグレーションまで） |
| `scripts/rotate-db-token.sh` | Turso のトークンを作り直す（古いトークンはすべて無効）。新しいトークンは画面に出さずに Vercel に登録し、デプロイし直す |

## 構成

```text
knowledge/*.yaml        Knowledge Atom（正本）      スキーマ: lib/schema/atom.ts
generated/*.json        4 択問題                    スキーマ: lib/schema/question.ts
guides/*.yaml           サービスの図解               スキーマ: lib/schema/guide.ts
public/aws-icons/       図解に使う AWS 公式の Architecture Icons（2026-07-31 版から、使う分だけ）
lib/services.ts         知識ページのサービスの分類とアイコン
app/knowledge/          知識ページ。diagrams/ に図の部品（構成図・比較表・流れ図・判断フロー）
lib/scheduler.ts        次に出す問題を決める（純粋関数）
lib/study.ts            出題・回答の記録（DB）
lib/fsrs.ts             4 択の結果 → FSRS の評価
lib/config.ts           学習ルールの設定値
lib/db/                 DB（libSQL。ローカルは file:local.db、本番は Turso）とスキーマ
lib/auth/               ログイン（Better Auth + Google）、許可リスト、requireUser()
proxy.ts                未ログインなら /login へ（Cookie の有無だけを見る簡易チェック）
app/                    画面と API（/api/next, /api/review, /api/auth/*）
```

## 学習ルール（`lib/config.ts` で変更できる）

- **評価**: 不正解 → Again / 正解だが「勘だった」→ Hard / 正解 → Good。Easy は使わない
- **目標保持率** 90%、**新規** 1 日 20 問（学習画面の「あと 10 問」で追加）、1 日の区切りは朝 4 時
- **出題の優先順位**: 混同フォローアップ → 学習中（数分後の再出題）→ 復習（習熟度の低い Atom から）→ 新規 → 学習中の前倒し
- **新規の順番**: 同じ Atom の低い Level から。複数 Atom の問題は各 Atom の単独問題を 1 つ出してから。1 日のうちは、まだ出していない Atom を優先
- **混同フォローアップ**: 誤答で別の Atom を選ぶと、2 問後にその 2 つを見分ける問題（比較問題、または混同相手を必ず選択肢に含めた問題）を出す
- **習熟度**: Atom の全問題について「30 日後にも思い出せる確率」を平均したもの。80% 以上で習得済み

## コンテンツの状態

71 サービス・Atom 341 個・問題 1,322 問・図解 38 ファイル。**すべて `status: draft`（未レビュー）**。

| まとまり | サービス |
|---|---|
| 企画書の MVP | S3（Atom 42・問題 176） |
| 企画書の Phase 7 | EC2、VPC、IAM、Organizations、RDS/Aurora、DynamoDB、ElastiCache、ELB、Auto Scaling、CloudFront、Global Accelerator、Route 53、Lambda、API Gateway、SQS、SNS、EventBridge、Kinesis、EBS、EFS、FSx、CloudWatch、CloudTrail、AWS Config |
| 追加（SAA で頻出） | KMS、Secrets Manager、Systems Manager、WAF、Shield、GuardDuty、Macie、Inspector、Cognito、ECS/Fargate、EKS、Step Functions、Batch、Elastic Beanstalk、Storage Gateway、DataSync、Snowball、DMS、AWS Backup、Athena、Redshift、Glue、EMR、QuickSight、OpenSearch |
| 追加（2 回目） | グローバルインフラ（リージョン・AZ、Local Zones、Wavelength、Outposts）、CloudFormation、コスト管理（Cost Explorer、Budgets、コスト配分タグ、Cost Anomaly Detection）、Trusted Advisor、X-Ray、Security Hub、Detective、MemoryDB、DocumentDB、Neptune、Keyspaces、Timestream、AppSync、Amazon MQ、MSK、Transfer Family、Application Migration Service、Elastic Disaster Recovery、Lake Formation、AI / ML サービス（Rekognition、Textract、Comprehend、Transcribe、Polly、Translate、Lex、Kendra、Personalize、SageMaker AI、Bedrock） |
| 設計パターン | DR 戦略（バックアップと復元 / パイロットライト / ウォームスタンバイ / マルチサイト）、RPO と RTO、ステートレス、疎結合、冪等性、バックオフとジッター、責任共有モデル、Well-Architected、マルチ AZ |

Atom の重要度ごとの問題数（主の Atom として数えた場合）は、high は 4 問以上（S3 以外は 5 問以上）、medium は 3 問以上（企画書の Phase 7 などの主要サービスは 4 問以上）、low は 2 問以上。サービス別の問題数は S3 176、EC2 102、VPC 87、IAM 73、RDS 63、DynamoDB 59 の順。

問題タイプの内訳: 条件→用語 431、トリガー 241、アンチパターン 209、用語→意味 191、比較 145、本番型 71、関連 24、シナリオ 10。

- ファイルは `knowledge/<service>.yaml` と `generated/<service>.json`（S3 だけ `generated/s3-*.json` に分割、サービス横断の本番型は `generated/exam-cross.json`）
- 新しい問題は `lib/config.ts` の `serviceOrder`（S3 → EC2 → VPC → …）の順に、サービスごとに出る。2 回目に追加したサービスは最後（設計パターンのあと）
- 学習画面の「範囲」で、特定のサービスだけに絞って学習できる（`/study?service=s3`）
- 企画書の比較例（SQS vs SNS、ALB vs NLB、EBS vs EFS、Multi-AZ vs Read Replica、CloudFront vs Global Accelerator、Gateway vs Interface Endpoint、SG vs NACL、RDS vs DynamoDB、Kinesis vs SQS）は、すべて `confused_with` と比較問題にしてある

### 図解（`guides/*.yaml`）

知識ページの上部に出す、サービスの全体像の解説。1 ファイルに「試験で問われる判断」と、いくつかのセクション（説明文・図・箇条書き）を書く。図は 4 種類で、図の要素に `atom` を付けると、その用語カードへのリンクになる。

| 図の種類 | 使う場面 | 例 |
|---|---|---|
| `architecture` | 構成図。グリッドの上にグループ（リージョン・VPC・サブネットなど）とアイコンを置き、矢印でつなぐ | VPC の基本構成、S3 の全体像 |
| `table` | 比較表。`axis` で「左ほど〜・右ほど〜」の帯、`tone` でセルの色（good / bad / warn） | S3 のストレージクラス、SG と NACL |
| `flow` | 左から右への流れ（スマホでは縦） | ライフサイクル、エンベロープ暗号化 |
| `decision` | 条件から答えを選ぶ判断フロー（入れ子にできる） | どのロードバランサーを使うか |

- 比較の図解は `alsoShowOn` で関係するサービスのページにも出せる（例: `guides/guardduty.yaml` のセキュリティサービスの比較は、Inspector・Macie などのページにも出る）。そのときの見出しは `topic`。全 71 サービスに、自分か共有の図解がある
- 見分け方・キーワード早見表・関係は、図解ではなく Atom の `confused_with`・`triggers`・`relations` から自動で作る
- YAML の注意: `[a, b]` の中の半角カンマは区切りになるので、`3,000` のような数字を含む値は `"` で囲む。ラベルの改行 `\n` も `"` で囲んだときだけ効く。知らないキーはエラーになる（書き間違いに気づけるように）
- アイコンは `public/aws-icons/<名前>.svg`。`g-` で始まる汎用アイコンは黒一色なので、ダークモードでは反転して表示する

問題を直すときは `generated/*.json` を編集して `npm run validate`。開発サーバーは再起動しなくても反映される。
問題を使わなくする場合は削除せず `"status": "retired"` にする（学習履歴とのつながりを残すため）。**問題 ID は変えない。**

## 仮で決めたこと（確認・調整してほしい点）

1. **新規 20 問/日、保持率 90%** — 試験日から逆算して変えてよい
2. **新規の順番** — サービスの順（`serviceOrder`）→ Level の低い順。1 日のうちは、まだ出していない Atom の問題を優先するので、初日は S3 の「用語→意味」が中心になる。並び順は `lib/scheduler.ts` の `newQuestions`
3. **フォローアップは誤答から 2 問後、同時に未解決は 3 個まで** — `config.followupAfter` / `config.maxOpenFollowups`。見分け問題そのものを間違えても、次の見分け問題は作らない（連鎖を防ぐため。FSRS の再学習で数分後にまた出る）
4. **「正解だけ長い選択肢」の警告基準** — 正解が 12 字以上かつ、誤答の最長の 1.2 倍を超えたら警告
5. **問題の内容** — 私（Claude）が書いたもの。2026-09-26 に全 Atom・全問を読み直し、誤り 3 件と、2024〜2026 年の変更で古くなった記述（S3 のオブジェクトの上限 50 TB、gp3 の上限、Snowball Edge と Timestream for LiveAnalytics の新規受付終了、Security Hub CSPM への改名、サポートプランの変更、RDS Custom for Oracle のサポート終了など）を直した。変更した Atom の `sources` に、確認した公式ページを足してある。ただし全項目を公式ドキュメントと 1 つずつ照合したわけではないので、`status` は `draft` のまま
   - 提供が終わりつつあるサービス（Snowball Edge、Timestream for LiveAnalytics、RDS Custom for Oracle）の問題は、削除せずに解説へ注記を足した。試験に出にくくなったと判断したら `retired` にしてよい
6. **企画書の Phase 7 の一覧にないサービスも追加した** — セキュリティ、コンテナ、移行、分析、DR 戦略など。不要なら該当する `knowledge/*.yaml` と `generated/*.json` を削除する（学習前なら問題ない）
7. **2 回目の追加（2026-09-26）** — S3 以外のサービスの問題が少なかったので、Atom を 119 個（新しいサービスを含む）、問題を 871 問追加した。2 回目に追加した数値で、特に確認してほしいもの:
   - SQS の保持期間（デフォルト 4 日・最大 14 日）、Kinesis の 1 シャードあたり 1 MB/秒・1,000 レコード/秒（読み取り 2 MB/秒）、保持期間の最大 365 日
   - Lambda のメモリ 128 MB〜10,240 MB、非同期呼び出しの再試行 2 回、KMS の Encrypt API の 4 KB、DynamoDB の項目の 400 KB
   - IAM データベース認証のトークン 15 分、マルチ AZ DB クラスターのフェイルオーバー 35 秒程度、パーティションプレイスメントグループの 7 パーティション/AZ
   - API Gateway のキャッシュのデフォルト TTL 300 秒、ELB の登録解除の遅延のデフォルト 300 秒、CloudTrail のイベント履歴の 90 日
   - CloudHSM の FIPS 140-3 レベル 3、Trusted Advisor の全チェックに必要なサポートプラン、EBS マルチアタッチの 16 台
   - SQS のメッセージサイズの上限は 1 MiB（2025 年 8 月に拡大）と確認できたので、数値を書いた
   - Trusted Advisor の全チェックは Business Support+ 以上に直した（従来の Business と Enterprise On-Ramp は 2027 年 1 月に終了）
8. **本番型（exam）の問題** — サービスをまたぐ問題は主の Atom のサービスとして扱われ、`generated/exam-cross.json` に置いてある
9. **図解（2026-09-27 に追加）** — 内容は私（Claude）が既存の Atom と公式ドキュメントの知識をもとに書いたもので、すべて `draft`。数値や目安で特に確認してほしいもの:
   - Savings Plans・RI の割引「最大 72%」、スポットの「最大 90%」
   - DR 戦略の RPO・RTO の目安（バックアップと復元: 数時間 / パイロットライト: 数十分 / ウォームスタンバイ: 数分 / マルチサイト: ほぼゼロ）
   - Lambda@Edge の実行時間（ビューワー側 5 秒・オリジン側 30 秒）、Step Functions の Express の最大 5 分・標準の最大 1 年
   - KMS の AWS マネージドキーの自動ローテーション（毎年）
   - アイコンは AWS 公式の Architecture Icons（構成図の作成に使ってよい素材）を使っている
   - 知識ページのサービスの分類（ストレージ・コンピューティングなど）は `lib/services.ts` で変えられる
