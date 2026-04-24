# GitHub Actions self-hosted runner on 日本VPS セットアップ手順

## 背景
2026-04-21 前後に GitHub Actions (ubuntu-latest、US IPレンジ) からの DLsite / Fanza スクレイピングが連続失敗。
ローカル（日本IP）では成功することを確認済みで、**IPベースのbot検出 / geo判定が原因**と確定した。
恒久対策として、日本リージョンの VPS に GitHub Actions self-hosted runner を立てて、そこからスクレイプする。

## 選定
- **ConoHa VPS 1GB プラン**（月¥573、1時間単位課金）
- 東京リージョン
- Ubuntu 22.04 LTS
- 1時間¥1.1 で試せるので、もし VPS 業者IPもブロックされる場合も低リスクで撤退可能

## 作業順序

### 1. ConoHa VPS 契約（ユーザー、約15分）

1. https://www.conoha.jp/vps/ で申込
   - リージョン: **東京**
   - プラン: **1GB**
   - OS: **Ubuntu 22.04 (LTS)**
   - root パスワード: 複雑なものを設定しメモ
   - SSH Key: 任意（後でssh-copy-idでもOK）
2. 契約完了後、コントロールパネルで **IPv4 アドレス** を控える
3. VPS が起動していることを確認

### 2. ローカル Mac から SSH 接続（ユーザー、5分）

```
ssh root@<VPSのIPアドレス>
```

初回はフィンガープリント確認で `yes` を入力、root パスワードを入力。

### 3. VPS 初期セットアップ（VPS上で実行、約10分）

SSH 接続した VPS 上で、以下を1行ずつコピペで実行：

```
apt update && apt upgrade -y
```

```
apt install -y curl git build-essential ca-certificates
```

```
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
```

```
apt install -y nodejs
```

```
timedatectl set-timezone Asia/Tokyo
```

```
ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && echo y | ufw enable
```

確認（node と npm が入ったか）：

```
node --version && npm --version
```

`v22.x.x` と `10.x.x` が出ればOK。

### 4. 作業用ユーザー作成 & sudo設定（VPS上、5分）

root で運用するのは危険なので、runner専用ユーザーを作る：

```
adduser --disabled-password --gecos "" runner && usermod -aG sudo runner && echo "runner ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers.d/runner
```

```
su - runner
```

プロンプトが `runner@...` になればOK。

### 5. Playwright chromium の依存パッケージ導入（VPS上、5分）

runner ユーザーで：

```
sudo apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdbus-1-3 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 fonts-noto-cjk
```

### 6. GitHub Actions self-hosted runner 登録（VPS上、10分）

1. ブラウザで https://github.com/takuyakato/bisque-sales-analytics/settings/actions/runners/new を開く
   - Runner image: **Linux**
   - Architecture: **x64**
2. 表示されたコマンドを **順番にVPSで実行**（4つくらいある。`mkdir` / `curl` / `tar` / `./config.sh ...`）
3. `./config.sh ...` 実行時の質問：
   - `Enter the name of the runner group to add this runner to:` → Enter（default）
   - `Enter the name of runner:` → `conoha-tokyo-1` で Enter
   - `Enter any additional labels:` → `jp-ip` と入力して Enter
   - `Enter name of work folder:` → Enter（default）

### 7. runner を systemd サービス化（VPS上、2分）

```
sudo ./svc.sh install
```

```
sudo ./svc.sh start
```

```
sudo ./svc.sh status
```

`active (running)` と表示されればOK。これで VPS 再起動後も runner が自動起動する。

### 8. GitHub 側で runner を確認（ブラウザ、1分）

https://github.com/takuyakato/bisque-sales-analytics/settings/actions/runners
に `conoha-tokyo-1` が **Idle** 状態で表示されていればOK。

### 9. workflow の runs-on を self-hosted に切り替え（私が実行）

以下のファイルに `runs-on: ubuntu-latest` → `runs-on: [self-hosted, jp-ip]` の変更をコミット：
- `.github/workflows/scrape-dlsite-daily.yml`
- `.github/workflows/scrape-fanza-daily.yml`
- `.github/workflows/scrape-dlsite-backfill.yml`
- `.github/workflows/scrape-fanza-backfill.yml`

YouTube (`scrape-youtube-daily.yml`) は IP問題無関係なので `ubuntu-latest` のまま。

### 10. GitHub Actions cron 再有効化（私が実行）

```
gh workflow enable scrape-dlsite-daily.yml
gh workflow enable scrape-fanza-daily.yml
```

### 11. 動作確認（私＋ユーザー、15分）

```
gh workflow run scrape-dlsite-daily.yml
```

- GitHub Actions の run ページで VPS上で実行されているか確認
- 成功すれば Supabase の `ingestion_log` に `runner: github-actions` で1行増える
- Fanza も同様

失敗した場合：スクショが `scraper-errors/` に保存されるので、中身を見て原因切り分け。
- もし VPS IPも弾かれている場合 → ConoHa を撤退して別案（residential proxy など）を検討

## リスク対策

### ConoHa IPが弾かれた場合
→ ConoHaを1時間使用で解約（¥110程度）、以下の代替検討：
- さくらVPS 東京（別IPレンジ）
- Vultr Tokyo、Linode Tokyo
- Residential Proxy（BrightData 月$50〜）

### VPS 停止のリスク
- ConoHa の SLA は月99.99%
- 監視は明日以降に UptimeRobot（無料）を検討

### Secrets 漏洩リスク
- self-hosted runner は GitHub Secrets を VPS 上で一時的に復号する
- VPS に他者がログインできない限り漏洩しない
- runner ユーザーのみで動かし、root ログインは SSH 鍵のみに制限する運用を推奨

## 完了後の状態

- 毎朝 JST 05:00 (DLsite) / 05:15 (Fanza) に VPS 上で scraper が走る
- GitHub Actions のログは通常通り残る
- `ingestion_log` と `sales_daily` に日次データが入る
- `runs-on: [self-hosted, jp-ip]` と runner ラベルを付けているので、将来別 runner を追加しても競合しない

## 費用見積

| 項目 | 月額 |
|---|---|
| ConoHa VPS 1GB | ¥573 |
| 合計 | **¥573/月** |

## トラブル時の問い合わせ先

- Claude Codeに「VPS の self-hosted runner がエラー出た」と相談
- VPS のログ：`sudo journalctl -u actions.runner.* -f`（runner ログをリアルタイム表示）
