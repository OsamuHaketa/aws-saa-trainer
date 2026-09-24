# AWS Decision Trainer

AWS SAA の知識を **Knowledge Atom**（最小の知識単位）に分解し、そこから作った 4 択問題を FSRS の間隔反復で回す、ローカル専用の学習アプリ。

## 使い方

```bash
npm install
npm run dev        # http://localhost:3000
```

初回アクセス時に `local.db`（学習履歴、Git 管理外）が自動で作られる。

| 画面 | 内容 |
|---|---|
| `/` | 今日の復習待ち・新規の残り・正答率 |
| `/study` | 学習。キーボード: `1`〜`4` 回答 / `Enter` 次へ / `G` 勘だった / `Q W E R T` 間違えた理由 |
| `/dashboard` | カテゴリ別・問題タイプ別の正答率、混同ペア、苦手な Atom |
| `/knowledge` | Atom の一覧（facts、キーワード、関係、各問題の最新結果） |

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run validate` | Atom と問題の検証（スキーマ、参照切れ、正解だけ長い選択肢、問題文に答えが含まれる など） |
| `npm test` | 出題ロジックのテスト |
| `npm run typecheck` | 型チェック |
| `npm run db:generate` | `lib/db/schema.ts` を変えたあとにマイグレーションを作る（起動時に自動適用） |

## 構成

```text
knowledge/*.yaml        Knowledge Atom（正本）      スキーマ: lib/schema/atom.ts
generated/*.json        4 択問題                    スキーマ: lib/schema/question.ts
lib/scheduler.ts        次に出す問題を決める（純粋関数）
lib/study.ts            出題・回答の記録（DB）
lib/fsrs.ts             4 択の結果 → FSRS の評価
lib/config.ts           学習ルールの設定値
app/                    画面と API（/api/next, /api/review）
```

## 学習ルール（`lib/config.ts` で変更できる）

- **評価**: 不正解 → Again / 正解だが「勘だった」→ Hard / 正解 → Good。Easy は使わない
- **目標保持率** 90%、**新規** 1 日 20 問（学習画面の「あと 10 問」で追加）、1 日の区切りは朝 4 時
- **出題の優先順位**: 混同フォローアップ → 学習中（数分後の再出題）→ 復習（習熟度の低い Atom から）→ 新規 → 学習中の前倒し
- **新規の順番**: 同じ Atom の低い Level から。複数 Atom の問題は各 Atom の単独問題を 1 つ出してから。1 日のうちは、まだ出していない Atom を優先
- **混同フォローアップ**: 誤答で別の Atom を選ぶと、2 問後にその 2 つを見分ける問題（比較問題、または混同相手を必ず選択肢に含めた問題）を出す
- **習熟度**: Atom の全問題について「30 日後にも思い出せる確率」を平均したもの。80% 以上で習得済み

## コンテンツの状態

S3 の Atom 42 個・問題 154 問。**すべて `status: draft`（未レビュー）**。

| ファイル | 問題数 |
|---|---|
| s3-storage-class.json | 36 |
| s3-security.json | 36 |
| s3-data-management.json | 23 |
| s3-architecture.json | 22 |
| s3-encryption.json | 15 |
| s3-performance.json | 14 |
| s3-exam.json（複数 Atom の本番型） | 8 |

問題を直すときは `generated/*.json` を編集して `npm run validate`。開発サーバーは再起動しなくても反映される。
問題を使わなくする場合は削除せず `"status": "retired"` にする（学習履歴とのつながりを残すため）。**問題 ID は変えない。**

## 仮で決めたこと（確認・調整してほしい点）

1. **新規 20 問/日、保持率 90%** — 試験日から逆算して変えてよい
2. **新規の順番が Level 優先** — 初日はほぼ「用語→意味」になる。Atom ごとにまとめて出したい場合は `lib/scheduler.ts` の `newQuestions` の並び順を変える
3. **フォローアップは誤答から 2 問後** — `config.followupAfter`
4. **「正解だけ長い選択肢」の警告基準** — 正解が 12 字以上かつ、誤答の最長の 1.2 倍を超えたら警告
5. **問題の内容** — 私（Claude）が書いたもので、公式ドキュメントとの照合はまだ。特に数値（30 / 90 / 180 日、5 GB / 5 TB、3,500 / 5,500 リクエスト、取り出し時間）を確認してほしい
