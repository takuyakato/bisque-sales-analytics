#!/bin/bash
# VPS 初期セットアップスクリプト
# 使い方: VPS に root で SSH 後、 /tmp/vps-bootstrap.sh として配置し
#   sudo bash /tmp/vps-bootstrap.sh
# 冪等: 何度実行しても安全

set -e

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: root で実行してください（sudo bash vps-bootstrap.sh）"
  exit 1
fi

echo "=== [1/7] system update ==="
apt update
DEBIAN_FRONTEND=noninteractive apt upgrade -y

echo ""
echo "=== [2/7] 必要パッケージ ==="
apt install -y curl git build-essential ca-certificates

echo ""
echo "=== [3/7] Node.js 22 LTS ==="
if ! command -v node &>/dev/null || ! node --version | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi
echo "node: $(node --version)"
echo "npm:  $(npm --version)"

echo ""
echo "=== [4/7] Playwright chromium 依存パッケージ ==="
apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdbus-1-3 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 fonts-noto-cjk

echo ""
echo "=== [5/7] タイムゾーン: Asia/Tokyo ==="
timedatectl set-timezone Asia/Tokyo
echo "現在時刻: $(date)"

echo ""
echo "=== [6/7] firewall (ufw) ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
echo y | ufw enable
ufw status

echo ""
echo "=== [7/7] runner ユーザー作成 ==="
if id runner &>/dev/null; then
  echo "runner ユーザーは既に存在"
else
  adduser --disabled-password --gecos "" runner
  usermod -aG sudo runner
  echo "runner ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner
  chmod 0440 /etc/sudoers.d/runner
  echo "runner ユーザー作成完了"
fi

echo ""
echo "=========================================="
echo "Bootstrap 完了。次のステップ:"
echo ""
echo "  1. runner ユーザーに切替: su - runner"
echo "  2. GitHub の Settings → Actions → Runners → New self-hosted runner を開く"
echo "  3. Linux x64 の4つのコマンド（mkdir / curl / tar / ./config.sh）を順に実行"
echo "  4. ./config.sh 実行時:"
echo "     - runner名: conoha-tokyo-1"
echo "     - labels: jp-ip"
echo "  5. systemd 化: sudo ./svc.sh install && sudo ./svc.sh start"
echo "=========================================="
