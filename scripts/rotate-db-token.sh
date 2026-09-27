#!/usr/bin/env bash
# Turso の DB トークンを作り直す。古いトークンはすべて無効になる（流出したときや、定期的な入れ替えに使う）。
# 新しいトークンは画面にもファイルにも出さず、Vercel の環境変数（Sensitive）に直接登録して、デプロイし直す。
#
# 使い方:
#   scripts/rotate-db-token.sh            dev と prod の両方を作り直す（切り替えの間、1〜2 分ほど DB に接続できない）
#   scripts/rotate-db-token.sh env-local  .env.local の DATABASE_AUTH_TOKEN を、dev の新しいトークンに置き換える
#
# 前提: turso にログイン済み（turso auth login）、Vercel にログイン済みでこのリポジトリが link 済み（npx vercel link）
set -euo pipefail
set +x # トークンがコマンドの表示に出ないように

cd "$(dirname "$0")/.."
DEV_DB=saa-trainer-dev
PROD_DB=saa-trainer-prod
ORG=osamuhaketa # Turso の組織（turso org list の current）

vercel() { npx --no-install vercel "$@"; }

# トークンを作って変数に入れる。形式がおかしければ中身を出さずに止める
new_token() {
  local token
  token=$(turso db tokens create "$1")
  if [[ ! $token =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    echo "✖ $1 のトークンの作成に失敗した（出力が想定した形式でない）" >&2
    exit 1
  fi
  printf '%s' "$token"
}

# 値はコマンドライン引数ではなく標準入力で渡す（ps で見えないように）。
# 作成に失敗したときに空の値を登録しないよう、先に変数に入れてから渡す
set_vercel_env() { # set_vercel_env <production|preview> <DB>
  local token
  token=$(new_token "$2")
  printf '%s' "$token" | vercel env add DATABASE_AUTH_TOKEN "$1" --force --sensitive --yes >/dev/null
  echo "✓ Vercel の $1 の DATABASE_AUTH_TOKEN を $2 の新しいトークンにした"
}

latest_deployment() { # latest_deployment <production|preview> [メタデータの条件]
  vercel ls --environment "$1" --status READY --json --limit 1 ${2:+-m "$2"} 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).deployments[0];if(d)console.log(d.url)})'
}

if [[ ${1:-} == env-local ]]; then
  if ! grep -q '^DATABASE_AUTH_TOKEN=' .env.local 2>/dev/null; then
    echo ".env.local に DATABASE_AUTH_TOKEN の行がないので、何もしない（ローカルの DB を使っている）"
    exit 0
  fi
  token=$(new_token "$DEV_DB")
  tmp=$(mktemp .env.local.XXXXXX)
  grep -v '^DATABASE_AUTH_TOKEN=' .env.local >"$tmp" || true
  printf 'DATABASE_AUTH_TOKEN=%s\n' "$token" >>"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env.local
  echo "✓ .env.local の DATABASE_AUTH_TOKEN を $DEV_DB の新しいトークンにした"
  exit 0
fi

# DB の署名の鍵をローテーションして、その DB の古いトークンをすべて無効にする。
# turso group tokens invalidate は「成功」と出ても古いトークンが使え続けた（2026-09、aws- のリージョンの DB）ので、
# Platform API で DB ごとに行う。CLI のログインのトークンは、ps で見えないよう標準入力からヘッダーとして渡す
rotate_keys() { # rotate_keys <DB>
  local code
  code=$(printf 'Authorization: Bearer %s' "$(turso auth token)" |
    curl -s -o /dev/null -w '%{http_code}' -X POST -H @- \
      "https://api.turso.tech/v1/organizations/$ORG/databases/$1/auth/rotate")
  if [[ $code != 200 ]]; then
    echo "✖ $1 の鍵のローテーションに失敗した（HTTP $code）" >&2
    exit 1
  fi
  echo "✓ $1 の古いトークンをすべて無効にした"
}

# 環境変数はデプロイし直したときに反映される。本番が止まる時間を短くするため、本番から先に済ませる
rotate_keys "$PROD_DB"
set_vercel_env production "$PROD_DB"
url=$(latest_deployment production)
vercel redeploy "$url" --target production >/dev/null
echo "✓ 本番をデプロイし直した"

rotate_keys "$DEV_DB"
set_vercel_env preview "$DEV_DB"
url=$(latest_deployment preview githubCommitRef=develop)
if [[ -n $url ]]; then
  vercel redeploy "$url" >/dev/null
  echo "✓ develop のプレビューをデプロイし直した"
fi

echo
echo "ローカルで Turso の dev を使っているなら、.env.local のトークンも無効になっている。次で置き換える:"
echo "  scripts/rotate-db-token.sh env-local"
