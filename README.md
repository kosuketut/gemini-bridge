# Gemini Bridge (Aside Antigravity Bridge)

[日本語版 README](./README.ja.md)

Use Gemini models in Aside with your Google account instead of a billed Gemini API key.

This is a local, OpenAI Chat Completions-compatible bridge that lets Aside call the Google Antigravity / Cloud Code Assist models exposed by [`pi-antigravity`](https://github.com/Rahularya01/pi-antigravity). Internally the project is named `aside-antigravity-bridge`, which is why commands, the state directory, and environment variables use that name.

> This is an unofficial experimental integration. It is not affiliated with or endorsed by Google or Aside. Google can change or disable the internal Antigravity endpoints at any time. Use only an account and services you are authorized to access.

## What it provides

- Google OAuth 2.0 Authorization Code flow with PKCE
- Automatic OAuth access-token refresh
- Dynamic Antigravity model discovery
- `GET /v1/models`
- `POST /v1/chat/completions`
- Streaming and non-streaming responses
- Text, base64 image input, reasoning output, and tool calls
- Tool-call thought-signature replay for Gemini multi-turn tool use
- Loopback-only server and a separate random local API key
- Optional macOS launchd startup

Not implemented: OpenAI Responses API, embeddings, audio, remote image downloads, or image-generation endpoints.

## Requirements

- macOS or another system with Node.js 22 or later
- A Google account with access to the relevant Antigravity / Cloud Code Assist service
- Aside with Custom AI Provider support

Model availability and quotas are account-dependent. A Gemini Advanced subscription alone does not guarantee Antigravity access.

## Quick start

### 1. Get the code and build

```bash
git clone https://github.com/kosuketut/gemini_bridge.git
cd gemini_bridge
npm ci --ignore-scripts
npm run build
```

The build produces a self-contained `dist/cli.mjs`, so after this step only `node` is needed. `dist/` is not checked in. After `git pull`, run `npm ci --ignore-scripts && npm run build` again.

Run all of the following commands from this directory.

### 2. Sign in to Google

```bash
node dist/cli.mjs login
```

A browser window opens. Review the Google permissions, complete sign-in, and return to the terminal. On the same Mac, the localhost callback is captured automatically and the command exits after printing `Login saved`. Credentials are stored in:

```text
~/.aside-antigravity-bridge/credentials.json
```

The directory is mode `700`; credential and configuration files are mode `600`.

### 3. Start the bridge

```bash
node dist/cli.mjs serve
```

The default base URL is:

```text
http://127.0.0.1:8787/v1
```

The server never binds to a LAN-facing address.

### 4. Get the local API key

In a second terminal:

```bash
node dist/cli.mjs key
```

This key protects the localhost API. It is not a Google API key. Do not post it publicly.

### 5. Register it in Aside

Open **Settings → Models → Providers → Connect → Custom provider** and use:

| Field | Value |
|---|---|
| Name | `Antigravity Local` |
| API / protocol | `OpenAI Chat Completions` / `openai-completions` |
| Base URL | `http://127.0.0.1:8787/v1` |
| API key | Output of `node dist/cli.mjs key` |

Let Aside discover models from `/v1/models`. If the UI asks for a model manually, first run:

```bash
node dist/cli.mjs models
```

Then add one of the returned IDs, for example `gemini-3.8-flash`. Do not assume every fallback model is enabled for the signed-in account.

### 6. Select the model

Open **Settings → Models → Task models**, choose an Antigravity model, and start a new Aside task.

## Optional macOS automatic startup

Build first (step 1) and move this project to a stable location. The launch agent records the current absolute project path and Node.js path. After rebuilding or upgrading Node.js, run the install command again to restart the bridge with the new build.

Install and start:

```bash
node scripts/install-launchd.mjs
```

Remove it:

```bash
node scripts/uninstall-launchd.mjs
```

Logs are written under `~/.aside-antigravity-bridge/`. OAuth credentials are not removed by the uninstall command.

## Commands

After building:

```bash
node dist/cli.mjs login   # Google OAuth login or re-login
node dist/cli.mjs serve   # Start the local bridge
node dist/cli.mjs status  # Show safe status; does not print tokens or the API key
node dist/cli.mjs key     # Print the local API key for Aside setup
node dist/cli.mjs models  # Refresh and list models available to the account
```

For source development, use the npm aliases, which rebuild before running:

```bash
npm run check
npm run login
npm run serve
```

## Local checks

Health does not require a key:

```bash
curl http://127.0.0.1:8787/health
```

Expected shape:

```json
{
  "status": "ok",
  "service": "aside-antigravity-bridge",
  "authenticated": true,
  "models": 8
}
```

List models, replacing `<LOCAL_KEY>` with the value from the `key` command:

```bash
curl -H 'Authorization: Bearer <LOCAL_KEY>' \
  http://127.0.0.1:8787/v1/models
```

Minimal non-streaming request:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Authorization: Bearer <LOCAL_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-3.8-flash",
    "messages": [{"role":"user","content":"Reply with OK."}],
    "stream": false
  }'
```

## Configuration

State defaults to:

```text
~/.aside-antigravity-bridge/
├── config.json       # loopback host, port, random local API key
└── credentials.json  # Google OAuth access/refresh tokens and project ID
```

Set `ASIDE_ANTIGRAVITY_HOME` before running any command to use another state directory. To change the port, stop the bridge and edit `config.json`. The host validator accepts only `127.0.0.1` or `::1`.

## Security design

- The service binds only to loopback.
- Every `/v1/*` endpoint requires a random bearer key.
- Bearer-key comparison is constant-time.
- Request bodies are limited to 25 MiB.
- Remote image URLs are rejected to avoid server-side request forgery; base64 `data:` images are accepted.
- Prompts, headers, OAuth tokens, and Google responses are not logged.
- Secret files are written atomically with restrictive permissions.
- Tool-call thought signatures are kept only in memory and expire after 24 hours.

The upstream package requests Google scopes including `aicode`, `cloud-platform`, user profile, logging, and experiments/configuration. Review the consent screen before approval. For initial testing, consider a secondary Google account rather than your primary account.

## Troubleshooting

### `Google login is not configured`

Run:

```bash
node dist/cli.mjs login
```

For a genuinely remote or headless machine whose browser cannot reach the bridge's localhost callback, explicitly enable manual callback entry:

```bash
ASIDE_ANTIGRAVITY_MANUAL_CALLBACK=1 node dist/cli.mjs login
```

Paste the callback URL only into that terminal prompt. Never send it in chat or post it publicly.

### Aside cannot connect

1. Confirm `node dist/cli.mjs serve` is still running.
2. Open `http://127.0.0.1:8787/health`.
3. Re-copy the local key with `node dist/cli.mjs key`.
4. Confirm the Aside base URL ends in `/v1`.
5. Choose the OpenAI Chat Completions protocol, not the Responses protocol.

### Model unavailable or quota errors

Run:

```bash
node dist/cli.mjs models
```

Choose another returned model or wait for the account's quota reset. Models can share quota pools.

### OAuth expired or revoked

Run `node dist/cli.mjs login` again. The bridge refreshes normal expired access tokens automatically.

## Development

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

The tests cover protocol conversion, tool-signature restoration, base64 image handling, secret-file permissions, loopback health, API-key rejection, and missing-login behavior. A live Google end-to-end test is intentionally not part of the automated suite because it requires user OAuth consent and consumes account quota.

## Credits and license

This project is released under the [MIT License](./LICENSE).

It depends on `pi-antigravity` 0.7.1 by Rahul Arya, and the built `dist/cli.mjs` also bundles `@earendil-works/pi-ai` and `undici`. All three are MIT-licensed. See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
