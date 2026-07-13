# 概算 粗利計算

せどり用のかんたん粗利計算アプリです。

- 売値、仕入値、送料からメルカリ手数料10%込みの概算粗利を計算
- たのメル便は80〜450サイズから送料を選び、専用の手数料計算に切り替え
- 仕入値と送料から損益分岐点を表示
- 品名、日付、店舗名、配送方法つきでブラウザ内に保存
- 保存時に在庫帳へ「出品前」として自動登録し、出品前の編集内容も同期
- 今日の保存履歴と月別カレンダーを表示
- JSONバックアップの書き出し・読み込みとCSV出力に対応

## 計算式

- 手数料 = 売値 × 10%（四捨五入）
- 概算粗利 = 売値 - 手数料 - 仕入値 - 送料
- 損益分岐点 = 手数料を引いた後に `仕入値 + 送料` を回収できる最小の売値
- たのメル便の手数料 = `(売値 - 送料) × 10%`（四捨五入）

## 公開

`index.html`、`calendar/index.html`、`inventory/`、`styles.css`、`app.js`、`manifest.webmanifest`、`sw.js`、`icons/` を静的ホスティングに置くと公開できます。

このリポジトリは GitHub Pages 用の workflow を含んでいます。`main` ブランチへ push すると自動デプロイされます。

## URL

- 粗利計算アプリ: `/sedori-profit-calculator/`
- 在庫管理アプリ: `/sedori-profit-calculator/inventory/`
- 同期版 在庫管理アプリ: `https://sedori-profit-calculator.pages.dev/inventory/`

在庫管理アプリは `inventory/` フォルダに分けて配置しています。保存データとPWAキャッシュは粗利計算アプリと別のキーを使います。
GitHub Pages 側の在庫帳は端末保存版として案内を表示し、日常利用では Cloudflare の同期版を正本にします。粗利計算から同期版へ移動すると戻り先URLを引き継ぐため、カレンダー履歴が保存されている元のドメインへ戻れます。
在庫管理アプリには管理表CSV由来の初期在庫データを同梱しているため、新しい端末で開いても在庫数が表示されます。

## Cloudflare同期版

`functions/inventory/api/inventory.js` に Cloudflare Pages Functions 用の同期APIを追加しています。
Cloudflare Pages + D1 + Access を設定すると、在庫管理アプリは `/inventory/api/inventory` を使ってPC/スマホ間で同期します。
GitHub Pages の粗利計算で保存した「出品前」の商品も、Cloudflare Access へのログイン後に同APIへマージ送信されます。送信できない間は端末に未送信状態を残し、次回表示・オンライン復帰時に再試行します。

- D1 binding名: `SEDORI_DB`
- 任意の許可メール環境変数: `INVENTORY_OWNER_EMAIL`
- D1スキーマ: `cloudflare/schema.sql`
- 設定手順: `cloudflare/README.md`

Cloudflare APIが使えない環境では、これまで通り端末内保存で動作します。
