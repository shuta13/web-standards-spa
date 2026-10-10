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
