# AniCour(アニクール)

自分が今見ているアニメの放送・配信スケジュールをカレンダー形式でまとめて管理する、個人用のWebアプリです。

しょぼいカレンダー(https://cal.syoboi.jp/)から現在放送中の作品データを取得し、見たい作品と視聴方法(地上波・BS・配信サービスなど)を選ぶと、そのままカレンダーに反映されます。

## できること

- 現在放送中のアニメ一覧から、見ている作品・視聴方法を選んでカレンダーに登録
- 1つの作品に複数の視聴方法(地上波/BS/配信サービスなど)がある場合はどれか選択可能
- 月表示・週表示の切り替え
- スマホのホーム画面に追加してアプリのように使える(PWA対応)
- 局・配信サービスごとの色を自由にカスタマイズ
- 合言葉を使った複数端末間の選択状態の同期
- 放送・配信の直前(8〜13分前)にプッシュ通知でお知らせ

## 使用技術

- フロントエンド: React + Vite
- ホスティング: Vercel(Serverless Functionsでバックエンド処理も兼ねる)
- データソース: [しょぼいカレンダー](https://cal.syoboi.jp/) API
- 通知の保存先: Upstash for Redis(Vercel経由で接続)
- プッシュ通知: Web Push API(VAPID)
- 通知チェックの定期実行: [cron-job.org](https://cron-job.org)(外部の無料スケジューラ)

## ディレクトリ構成

```
src/            フロントエンド(React)本体
api/            Vercel Serverless Functions
  _lib/         しょぼいカレンダーの取得・整形ロジック(共通処理)
  programs.js   番組データ取得API
  sync.js       複数端末同期API
  push-subscribe.js  プッシュ通知の購読登録API
  notify-check.js    通知を実際に送るチェック処理(cronから呼び出す)
public/         PWA関連ファイル(アイコン・manifest・Service Worker)
```

## セットアップ(自分用メモ)

### 環境変数(Vercel)

| 変数名 | 用途 |
|---|---|
| `VAPID_PUBLIC_KEY` | プッシュ通知用の公開鍵 |
| `VAPID_PRIVATE_KEY` | プッシュ通知用の秘密鍵 |
| `NOTIFY_CRON_SECRET` | `notify-check` APIを外部から叩く際の簡易認証キー |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` など | Upstash for Redis接続情報(Vercel連携で自動設定) |

### 外部サービス連携

- **Upstash for Redis**: Vercelの Storage タブから接続
- **cron-job.org**: `https://<公開URL>/api/notify-check?secret=<NOTIFY_CRON_SECRET>` を5分おきに呼び出すよう設定

## 注意点・既知の制約

- データは[しょぼいカレンダー](https://cal.syoboi.jp/)の情報を利用しています。地上波・BS・CSは比較的網羅されていますが、配信サービス限定の作品は登録状況にばらつきがあります
- 「新番組フィルタ」は話数情報からの推測のため、完璧ではありません
- 通知は無料の外部スケジューラ(5分おき)に依存しているため、タイミングは目安(放送8〜13分前)です
- 個人の学習・利用目的で作成したものです

---

Claude([claude.ai](https://claude.ai))と対話しながら開発しました。
