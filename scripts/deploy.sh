#!/usr/bin/env bash
# develop を本番に出す。未適用のマイグレーションがあれば、本番のバックアップ → dev と prod に適用 → デプロイ の順に行う。
# Turso のトークンはこの中で作って環境変数で渡すだけで、画面にもファイルにも出さない（Claude に実行させても値は見えない）。
# Claude はトークンを直接作れない（.claude/settings.json の deny）。このスクリプトだけを allow で許可している
#
# 使い方:
#   scripts/deploy.sh                 チェック → マイグレーション（あれば）→ develop と main を push → 本番のデプロイを待つ
#   scripts/deploy.sh --migrate-only  マイグレーションまで（push しない）
#
# 前提: turso にログイン済み（turso auth login）、Vercel にログイン済みでこのリポジトリが link 済み（npx vercel link）、
#       develop にいて未コミットの変更がない。本番は main への push で Vercel が自動でデプロイする
set -euo pipefail
set +x # トークンがコマンドの表示に出ないように

cd "$(dirname "$0")/.."
DEV_DB=saa-trainer-dev
PROD_DB=saa-trainer-prod
PROD_URL=https://aws-saa-trainer.vercel.app

migrate_only=false
case ${1:-} in
  "") ;;
  --migrate-only) migrate_only=true ;;
  *) echo "使い方: scripts/deploy.sh [--migrate-only]" >&2; exit 2 ;;
esac

step() { printf '\n▶ %s\n' "$1"; }
fail() { echo "✖ $1" >&2; exit 1; }
vercel() { npx --no-install vercel "$@"; }

# トークンを作って出力する（呼び出し側で変数に入れる）。形式がおかしければ中身を出さずに止める
new_token() {
  local token
  token=$(turso db tokens create "$1" --expiration 1d)
  if [[ ! $token =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    fail "$1 のトークンの作成に失敗した（出力が想定した形式でない）"
  fi
  printf '%s' "$token"
}

# with_db <DB> <コマンド…>: その DB の URL とトークンを環境変数に入れてコマンドを実行する
with_db() {
  local url token
  url=$(turso db show "$1" --url)
  token=$(new_token "$1")
  DATABASE_URL="$url" DATABASE_AUTH_TOKEN="$token" "${@:2}"
}

pending() { # pending <DB>: 未適用のマイグレーションを 1 行ずつ
  with_db "$1" npx --no-install tsx scripts/pending-migrations.ts
}

step "作業ツリーとブランチを確認"
[[ $(git branch --show-current) == develop ]] || fail "develop で実行する"
[[ -z $(git status --porcelain) ]] || fail "未コミットの変更がある"
git fetch --quiet origin
git merge-base --is-ancestor origin/develop develop || fail "origin/develop に、手元にないコミットがある（pull してから）"
git merge-base --is-ancestor origin/main develop || fail "main が develop から分かれている（main を早送りできない）"
echo "✓ develop（$(git rev-parse --short HEAD)）"

step "型・テスト・問題データを確認"
npm run --silent typecheck
npm test --silent >/dev/null || { npm test --silent; fail "テストが通らない"; }
npm run --silent validate >/dev/null || { npm run --silent validate; fail "問題データの検証が通らない"; }
echo "✓ typecheck・test・validate"

step "未適用のマイグレーションを確認"
pending_dev=$(pending "$DEV_DB")
pending_prod=$(pending "$PROD_DB")
echo "dev:  $(echo ${pending_dev:-なし})"
echo "prod: $(echo ${pending_prod:-なし})"

if [[ -n $pending_prod ]]; then
  step "本番の学習記録をバックアップ（backups/）"
  with_db "$PROD_DB" npm run --silent backup
fi
if [[ -n $pending_dev ]]; then
  step "dev にマイグレーションを適用"
  with_db "$DEV_DB" npm run --silent db:migrate
fi
if [[ -n $pending_prod ]]; then
  step "prod にマイグレーションを適用"
  with_db "$PROD_DB" npm run --silent db:migrate
fi
[[ -z $(pending "$DEV_DB") && -z $(pending "$PROD_DB") ]] || fail "未適用のマイグレーションが残っている"

if $migrate_only; then
  echo; echo "✓ マイグレーションまで終わった（--migrate-only なので push しない）"
  exit 0
fi

sha=$(git rev-parse HEAD)
if [[ $(git rev-parse origin/main) == "$sha" ]]; then
  echo; echo "✓ main はすでに develop と同じなので、デプロイするものはない"
  exit 0
fi

step "develop と main を push（main への push で本番がデプロイされる）"
git push --quiet origin develop
git push --quiet origin develop:main
git branch --force main origin/main >/dev/null 2>&1 || true
echo "✓ main を $(git rev-parse --short HEAD) に進めた"

step "本番のデプロイを待つ（最大 10 分）"
state=""
for _ in $(seq 60); do
  sleep 10
  state=$(vercel ls --environment production --json --limit 1 -m "githubCommitSha=$sha" 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s).deployments[0];console.log(d?d.state:"")}catch{console.log("")}})')
  case $state in
    READY) break ;;
    ERROR | CANCELED) fail "本番のデプロイが $state になった（npx vercel ls で確認する）" ;;
  esac
done
[[ $state == READY ]] || fail "10 分たってもデプロイが終わらない（状態: ${state:-未開始}）"

code=$(curl -s -o /dev/null -w '%{http_code}' "$PROD_URL/login")
[[ $code == 200 ]] || fail "デプロイは終わったが、$PROD_URL/login が $code を返した"
echo "✓ 本番にデプロイした: $PROD_URL"
