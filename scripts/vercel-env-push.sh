#!/usr/bin/env bash
# .env.local の値を Vercel 本番環境変数として一括投入
# 使い方: bash scripts/vercel-env-push.sh

set -e

# Vercelに登録する変数リスト（空値は除外）
VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  ACCESS_PASSWORD_HASH
  SESSION_SECRET
  CRON_SECRET
  DLSITE_USERNAME
  DLSITE_PASSWORD
  FANZA_USERNAME
  FANZA_PASSWORD
  NOTION_API_TOKEN
  NOTION_KPI_PARENT_PAGE_ID
  USD_JPY_RATE
)

for NAME in "${VARS[@]}"; do
  # .env.local から該当行を取得して値を抽出
  VAL=$(grep -E "^${NAME}=" .env.local | head -1 | cut -d= -f2-)
  if [ -z "$VAL" ]; then
    echo "⏭️  $NAME: 空なのでスキップ"
    continue
  fi
  # 既存削除（失敗してもOK）
  printf "%s\n" "y" | vercel env rm "$NAME" production --yes 2>/dev/null || true
  # 新規追加（値を stdin 経由で渡す）
  printf "%s" "$VAL" | vercel env add "$NAME" production 2>&1 | tail -1 | sed "s/^/   /"
  echo "✅ $NAME"
done
