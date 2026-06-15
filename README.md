# せどり粗利計算

仕入れ時に、仕入れ値・売値・送料からメルカリ手数料10%込みの粗利、粗利率、損益分岐売値を確認するための静的 Web アプリです。

## 計算式

- メルカリ手数料 = 売値 × 10%（1円未満切り上げ）
- 粗利 = 売値 - メルカリ手数料 - 仕入れ値 - 送料
- 粗利率 = 粗利 ÷ 売値 × 100
- 損益分岐売値 = 手数料10%差し引き後に仕入れ値 + 送料を回収できる最小売値
- 仕入れ上限 = 売値 - メルカリ手数料 - 送料

## 公開

`index.html`、`styles.css`、`app.js`、`manifest.webmanifest`、`sw.js`、`icons/` をそのまま静的ホスティングに置くと公開できます。
GitHub Pages、Cloudflare Pages、Netlify などの常時公開ホスティングに対応しています。

GitHub Pages で公開する場合は、このフォルダを GitHub リポジトリへ push し、リポジトリの `Settings > Pages` で `GitHub Actions` を選ぶと `.github/workflows/pages.yml` が常時公開を実行します。
