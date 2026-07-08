# Cloudflare同期版セットアップ

在庫管理アプリをPC/スマホで同期するためのCloudflare Pages + D1構成です。

## 構成

- Cloudflare Pages: アプリ本体
- Pages Functions: `/inventory/api/inventory`
- Cloudflare D1: 在庫データ保存
- Cloudflare Access: ログイン認証

## Cloudflare側で必要な設定

1. Cloudflare Pagesでこのリポジトリをデプロイします。
2. D1で `sedori-inventory` などのDBを作成します。
3. PagesプロジェクトのD1 bindingsに以下を追加します。

```text
Variable name: SEDORI_DB
D1 database: 作成したD1
```

4. Pagesプロジェクトの環境変数に、使うメールアドレスを設定します。

```text
INVENTORY_OWNER_EMAIL=your-email@example.com
```

複数人で使う場合はカンマ区切りにできます。

```text
INVENTORY_OWNER_EMAIL=owner@example.com,staff@example.com
```

5. Cloudflare AccessでPagesの在庫アプリURLを保護します。

```text
対象例: https://your-project.pages.dev/inventory/*
許可: INVENTORY_OWNER_EMAILに設定したメール
```

## D1スキーマ

APIは初回アクセス時にテーブルを自動作成します。手動で作る場合は以下を実行します。

```powershell
npx wrangler d1 execute sedori-inventory --file=cloudflare/schema.sql --remote
```

## 動作

アプリは起動時に `/inventory/api/inventory` を確認します。

- APIが使える場合: D1と同期します
- APIが使えない場合: 今まで通り端末内保存で動きます

初回同期では、端末内の在庫とD1上の在庫をマージします。D1が空なら、端末内の在庫をクラウドへアップロードします。
