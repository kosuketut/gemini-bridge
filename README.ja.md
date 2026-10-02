# Gemini Bridge (Aside Antigravity Bridge)

[English README](./README.md)

AsideからGeminiのモデルを使うためのローカルbridgeです。Gemini APIキーの従量課金ではなく、GoogleアカウントのAntigravity認証を使います。bridgeはOpenAI Chat Completions互換のAPIを `127.0.0.1` で提供し、Asideはそれをカスタムプロバイダーとして呼び出します。

プロジェクト内部の名前は `aside-antigravity-bridge` です。コマンド、状態ディレクトリー、環境変数にはこの名前を使っています。

> 非公式・実験的なツールです。GoogleやAsideとは関係がなく、承認も受けていません。Googleが内部のAntigravity endpointを変更・停止すると動かなくなります。利用が認められたアカウントとサービスでのみ使ってください。

## 必要なもの

- Node.js 22以降
- Antigravity / Cloud Code Assistを利用できるGoogleアカウント
- カスタムAIプロバイダーに対応したAside

使えるモデルと利用枠はアカウントによって異なります。Gemini Advancedを契約していても、Antigravityを使えるとは限りません。

## 使い方

### 1. コードを取得してビルド

```bash
git clone https://github.com/kosuketut/gemini-bridge.git
cd gemini-bridge
npm ci --ignore-scripts
npm run build
```

ビルドすると依存をすべて含んだ `dist/cli.mjs` ができるので、これ以降は `node` だけで動きます。`dist/` はリポジトリに含めていません。`git pull` で更新した後は、もう一度 `npm ci --ignore-scripts && npm run build` を実行してください。

以降のコマンドはすべてこのディレクトリーで実行します。

### 2. Googleにログイン

まず認証状態を確認します。

```bash
node dist/cli.mjs status
```

`"authenticated": false` と表示されたら、ログインします。

```bash
node dist/cli.mjs login
```

ブラウザーが開くので、Googleが求める権限を確認してからサインインしてください。完了するとターミナルに `Login saved` と表示されます。認証情報は `~/.aside-antigravity-bridge/credentials.json` に保存されます。以前このbridgeを使っていてこのディレクトリーが残っている場合は、保存済みの認証情報とローカルキーがそのまま使われます。

### 3. bridgeを起動

```bash
node dist/cli.mjs serve
```

このターミナルは開いたままにしてください。接続先は `http://127.0.0.1:8787/v1` です。ポートが使用中で起動できない場合は、別のbridgeがすでに動いていないか確認してください。

### 4. ローカルキーを取得

別のターミナルで同じディレクトリーに移動し、次を実行します。

```bash
node dist/cli.mjs key
```

表示されるのは、このbridgeへのアクセスを守るためのローカル専用キーです。GoogleのAPIキーではありません。AsideのAPIキー欄にだけ貼り付け、チャットなどには書き込まないでください。

### 5. Asideに登録

Asideで **Settings → Models → Providers → Connect → Custom provider** を開き、次のように設定します。

| 項目 | 値 |
|---|---|
| Name | `Antigravity Local` など任意 |
| API / protocol | `OpenAI Chat Completions` (`openai-completions`) |
| Base URL | `http://127.0.0.1:8787/v1` |
| API key | 手順4で取得したローカルキー |

モデルはAsideが `/v1/models` から自動で取得します。手動で入力する必要がある場合は、次のコマンドで使えるモデルIDを確認してください。

```bash
node dist/cli.mjs models
```

`gemini-3.8-flash` は一例です。アカウントによって使えるモデルが違うので、一覧に出てきたIDを選んでください。

#### JSONで設定する場合

AsideでプロバイダーをJSONで設定する場合は、次の内容を使います。

```json
{
  "providers": {
    "gemini-provider": {
      "name": "Antigravity Local",
      "baseUrl": "http://127.0.0.1:8787/v1",
      "api": "openai-completions",
      "apiKey": "<LOCAL_KEY>",
      "authHeader": true,
      "models": [
        {
          "id": "gemini-3.8-flash",
          "name": "Gemini 3.8 Flash",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 1048576,
          "maxTokens": 65536
        }
      ]
    }
  }
}
```

- `<LOCAL_KEY>` は `node dist/cli.mjs key` で表示されたローカルキーに置き換えてください。`authHeader: true` にすると、Asideはこのキーを `Authorization: Bearer <キー>` として送ります。本物のキーを書いたJSONは共有したりcommitしたりしないでください。
- `id` は `node dist/cli.mjs models` で表示されたモデルIDに置き換えてください。複数のモデルを使う場合は `models` に項目を追加します。
- `config.json` でポートを変更した場合は、`baseUrl` もそれに合わせてください。

### 6. モデルを選択

**Settings → Models → Task models** でAntigravityのモデルを選び、新しいAsideタスクを開始します。

## macOSで自動起動する

launchdに登録すると、ログイン時にbridgeが自動で起動します。先に手順1のビルドを済ませてください。登録時のディレクトリーとNode.jsの絶対パスが記録されるので、プロジェクトは移動しない場所に置いてください。再ビルドやNode.jsの更新をした後は、登録コマンドをもう一度実行するとbridgeが新しいビルドで再起動します。

```bash
node scripts/install-launchd.mjs
```

登録を解除するには次を実行します。

```bash
node scripts/uninstall-launchd.mjs
```

ログは `~/.aside-antigravity-bridge/` に出力されます。登録を解除してもGoogleの認証情報は削除されません。

## 困ったとき

- `Google login is not configured` と表示される: `node dist/cli.mjs login` を実行してください。
- Asideから接続できない: `serve` が動いているか、`http://127.0.0.1:8787/health` が開けるか、Base URLが `/v1` で終わっているか、プロトコルにResponsesではなくChat Completionsを選んでいるかを確認してください。
- モデルが使えない、または利用枠のエラーが出る: `node dist/cli.mjs models` で一覧を取り直し、別のモデルを選ぶか利用枠の回復を待ってください。

機能の詳細、セキュリティ設計、curlでの動作確認、開発手順は [README.md](./README.md) を参照してください。

## ライセンス

[MIT License](./LICENSE) です。同梱している依存パッケージのライセンスは [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) に記載しています。
