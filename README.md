# 概算 粗利計算

せどり用のかんたん粗利計算アプリです。

- 売値、仕入値、送料からメルカリ手数料10%込みの概算粗利を計算
- たのメル便は80〜450サイズから送料を選び、専用の手数料計算に切り替え
- 仕入値と送料から損益分岐点を表示
- 品名、日付、店舗名、配送方法つきでクラウドに保存
- 保存時に在庫帳へ「出品前」として自動登録し、出品前の編集内容も同期
- 今日の保存履歴と月別カレンダーをPC・スマホ間で同期
- JSONバックアップの書き出し・読み込みとCSV出力に対応

## 計算式

- 手数料 = 売値 × 10%（四捨五入）
- 概算粗利 = 売値 - 手数料 - 仕入値 - 送料
- 損益分岐点 = 手数料を引いた後に `仕入値 + 送料` を回収できる最小の売値
- たのメル便の手数料 = `(売値 - 送料) × 10%`（四捨五入）

## 公開

本番はCloudflare Pages + D1 + Accessで公開します。粗利計算・カレンダー・在庫帳を同じ認証とデータベースにまとめています。

GitHub Pages版は旧端末のローカル履歴を読み取り、Cloudflare統合版へ移行する入口として残します。`main` ブランチへpushするとworkflowで自動デプロイされます。

## URL

- 粗利計算: `https://sedori-profit-calculator.pages.dev/inventory/calculator/`
- カレンダー: `https://sedori-profit-calculator.pages.dev/inventory/calculator/calendar/`
- 在庫帳: `https://sedori-profit-calculator.pages.dev/inventory/`

Cloudflare Accessの保護範囲 `/inventory/*` に3画面と同期APIを配置します。粗利計算から在庫帳へ移動しても、戻るボタンは統合版の粗利計算へ戻ります。

旧GitHub Pages版またはCloudflareルート版を開くと、端末内の履歴と店舗一覧をURLフラグメントに圧縮して統合版へ移します。ログイン後にD1へ保存し、既存の計算履歴も在庫帳へ登録します。

## Cloudflare同期版

Pages Functionsの同期APIは、在庫を `/inventory/api/inventory`、計算履歴を `/inventory/api/calculator` でD1へ保存します。粗利計算の保存時は履歴と在庫を同一オリジン・同一Access認証内で続けて更新します。

通信できない間の変更は端末に未送信状態として残り、次回表示・オンライン復帰時に再試行します。画面の同期表示が「クラウド同期済み」になれば反映完了です。

- D1 binding名: `SEDORI_DB`
- 任意の許可メール環境変数: `INVENTORY_OWNER_EMAIL`
- D1スキーマ: `cloudflare/schema.sql`
- 設定手順: `cloudflare/README.md`

Cloudflare APIへ接続できない間も端末内で入力でき、接続回復後に同期します。
