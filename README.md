# Fieldnotes

フレームワーク、ビルド、npm依存、Polyfillを使わないタスク管理SPA。

## 起動

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Chrome 154で `chrome://flags/#enable-experimental-web-platform-features` をEnabledにして再起動し、http://127.0.0.1:8080 を開きます。機能検出に失敗した場合は画面に表示し、JavaScriptによるパッチの代替実装は行いません。

## 構成

- `index.html`: 永続シェル、Popoverメニュー、編集用dialog。
- `app.js`: ハッシュルーター、localStorage保存、パッチ生成、Web Component。
- `style.css`: レスポンシブUI、reduced-motion対応。
- `scripts/cdp.mjs`: Node 24の標準fetch/WebSocketを使う検証用DevTools接続。アプリの依存ではありません。

`<?start name="view">…<?end>` をターゲットに、`<template for="view">…</template>` を `streamAppendHTMLUnsafe()` に渡します。マーカーの探索や置換はブラウザーが実行します。更新後も再び更新できるよう、パッチ内で同名マーカーを再宣言しています。通常の操作はタスク一覧と集計だけ、ルート遷移はviewだけを更新します。

タスクカードのShadow DOMはHTMLの `template shadowrootmode="open"` で生成されます。並べ替えは `moveBefore()` で同じDOMを保持します。`AbortController` は画面・コンポーネントのイベント購読寿命を管理します。View Transition APIは画面遷移に使います。PopoverとdialogはブラウザーのTop Layerに表示します。

DOM Parts API、TC39 Signalsは採用していません。実機で公開されていないAPIをPolyfillで補いません。AbortSignalとリアクティブなSignalsは別の機能です。

生成HTMLに含むユーザー入力はエスケープし、外部HTMLを読み込みません。保存はブラウザー・オリジンごとで、同期やサーバー保存はありません。

## 検証状況

Chrome for Testing **154.0.8037.92**（macOS arm64）で `--enable-experimental-web-platform-features` を指定して検証済み。Chrome 155.0.8059.40でも同じ操作テストが通っています。

`node scripts/cdp.mjs --file scripts/browser-test.js` で、初期パッチ、DSD、DOMと購読を保持する並べ替え、追加、編集、完了切替、検索、ルート遷移、履歴戻り、Popover、削除、HTMLエスケープ、並べ替え後の重複防止を検証しました。

検証用Chromeは独立したプロファイルと `--remote-debugging-port=9224` で起動してください（別ポートは `CDP_PORT` で指定）。テストは初期サンプル3件がある専用プロファイルで実行してください。テスト終了時に保存データを復元しますが、表示は変更されるので再読み込みしてください。Node 24以降を使用します。

## 参照した提案

- https://github.com/WICG/declarative-partial-updates
- https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md
- https://github.com/WICG/declarative-partial-updates/blob/main/dynamic-markup-revamped-explainer.md

これらは進行中の提案です。特に構文と公開APIは実験フラグ付きのブラウザー実装に依存します。

## CSSによるルートマッチング

Chrome 154の実験フラグで動く `@location`、`@navigation`、`:link-to()` を使用しています。Explainerの旧構文 `@route` ではなく、現在のCSS Navigation Matching草案に合わせています。

```css
@location --about {
  hash: "/about";
}

@navigation (to: --about) {
  nav a:link-to(--about) {
    outline: 2px solid var(--green);
  }
}
```

`style.css` が遷移先リンク（タスク画面ではタスク群）の強調と、タスク画面→説明画面／説明画面→タスク画面のアニメーション方向を決めます。`app.js` は Navigation API の `navigate` を intercept し、HTMLパッチとView Transitionの完了まで待ちます。CSSに遷移情報を渡すため、以前の `hashchange` 購読を置き換えています。

`@navigation` は実行中の遷移に対応するため、完了後の現在地表示・アクセシビリティ用の `aria-current` は引き続きJSで更新します。画面の内容も従来どおりネイティブHTMLパッチで更新します。

URLとdialog／popoverの開閉を双方向に結び付ける宣言的機能はExplainerの将来構想であり、この実装には含めていません。CSSで表示だけ変えてTop Layerの開閉を代用することもしていません。

`node scripts/cdp.mjs --file scripts/route-test.js` で、ネイティブの名前付きURL判定、遷移中のスタイル適用、ルート別アニメーション、完了時の解除、履歴戻りを検証できます。

- https://github.com/WICG/declarative-partial-updates/blob/main/route-matching-explainer.md
- https://drafts.csswg.org/css-navigation-1/

## 一覧と詳細を往復する例

タスクのタイトルをクリックすると、そのタスクの詳細へ移動します。

- 一覧：`#/all`、`#/active`、`#/done`
- 検索条件付き一覧：`#/active?q=Web`
- 詳細：`#/task/native?list=active&q=Web`

詳細URLは直接開けます。再読み込みでもタスクを復元し、ブラウザーの戻る／進むにも対応します。「一覧へ戻る」は直前の履歴がその一覧なら履歴を戻し、詳細URLを直接開いた場合などはリンク先の一覧へ移動します。検索条件はURLに保持し、戻ると該当カードのタイトルへフォーカスを戻します。未知・削除済みのIDにはエラー画面と一覧リンクを表示します。タスク自体はlocalStorage保存なので、別のブラウザーへURLだけ渡してもユーザー作成データは共有されません。

### View Transition APIとの役割分担

View Transition APIだけでは、URLからどのタスクを表示するか、検索条件をどう復元するか、履歴をどう扱うかは決まりません。

- `routes.js`：URLと一覧・詳細・検索条件の対応。
- Navigation API：リンクと履歴移動を同じ処理で扱い、遷移の寿命をCSSに公開。
- 宣言的HTMLパッチ：URLに対応する詳細／一覧のHTMLを更新。
- CSS `@location` / `@navigation`：一覧→詳細／詳細→一覧を判定し、共有要素とアニメーション方向を指定。
- View Transition API：同じ `view-transition-name` のカードと詳細をアニメーションで結ぶ。

共有要素の名前はタスクID由来です。最後にクリックしたDOMを保存しないので、戻る／進むでも同じ項目が対応します。未実装の `:active-navigation()` を模倣しているわけではなく、標準の `view-transition-name` に安定した名前を付けています。CSSはルートの組み合わせを判定し、個々のIDとの対応はHTMLを生成するアプリ側の責任です。

この例は**詳細ページ**をURLへ対応付けています。Explainerにある宣言的なdialog／popoverの双方向URLバインディングそのものは採用していません。Polyfillもありません。

`node scripts/cdp.mjs --file scripts/detail-test.js` で検索URL・詳細表示・共有要素名・CSSの遷移方向・フォーカス復元・履歴往復・未知IDを検証できます。Chrome 154.0.8037.92＋Experimental Web Platform featuresで検証しています。
