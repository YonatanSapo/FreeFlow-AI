# PromptRouter

Route prompts to local (Ollama) and cloud LLMs without leaving VSCode.

## Features

- **Chat view** in the activity bar with a model dropdown, streaming responses, and a per-message model label. Switch models mid-session; each reply is tagged with the model that produced it.
- **Models manager** with status dots for every model:
  - Green = installed and reachable
  - Red = known but not installed
  - Grey = Ollama daemon unreachable, or cloud provider without a key
- **Full Ollama integration** via the local HTTP API: list installed tags, install (pull) with streaming progress, delete, and stream tokens from `/api/generate`.
- **Cloud providers scaffolded** (OpenAI, Gemini, Perplexity) with secure key storage through `vscode.SecretStorage`. Actual network calls are not yet implemented and surface `Not implemented` errors from the chat view.
- **No external backend, no telemetry.** Data only flows to your local Ollama daemon or, in the future, to your own cloud API keys.

## Requirements

- VSCode `^1.100.0`
- Node 18+ (bundled with current VSCode)
- For local models: [Ollama](https://ollama.com/) installed and running:
  ```bash
  ollama serve
  ```
  If the daemon isn't reachable, the extension shows a banner with that exact command and a Retry button. The extension never starts `ollama` for you.

### Troubleshooting `TypeError: fetch failed`

That message comes from Node’s HTTP client when it cannot complete a request to Ollama (often **connection refused** or **wrong host**).

1. Confirm Ollama is listening: run `ollama serve` in a terminal and leave it running.
2. The extension defaults to **`http://127.0.0.1:11434`** (IPv4 loopback). On some systems, `http://localhost:11434` resolves to IPv6 (`::1`) while Ollama only binds IPv4, which shows up as `fetch failed` with little detail.
3. If Ollama uses another host or port, set **Settings → PromptRouter → Ollama Base URL** (`promptrouter.ollamaBaseUrl`) to the URL printed when you start Ollama, then run **PromptRouter: Refresh Models**.

## Install & Run (development)

```bash
npm install
npm run compile
# Then press F5 in VSCode to launch the Extension Development Host
```

Available scripts:

- `npm run compile` — build the extension bundle and the webview bundles into `dist/`.
- `npm run watch` — rebuild on change.
- `npm test` — run the unit tests via `@vscode/test-cli`.
- `npm run lint` — ESLint over `src/`.

## Commands

All commands are prefixed with `PromptRouter:` in the command palette.

| Command | What it does |
| --- | --- |
| `PromptRouter: Open Chat` | Reveals the Chat view in the activity bar. |
| `PromptRouter: Refresh Models` | Re-runs the health check and re-reads `/api/tags`. |
| `PromptRouter: Install Ollama Model` | Prompts for a tag (preset or custom) and streams `ollama pull`. |
| `PromptRouter: Remove Ollama Model` | Lists installed tags and removes the one you pick. |
| `PromptRouter: Set Cloud Provider API Key` | Stores a key in `SecretStorage` for OpenAI / Gemini / Perplexity. |

## Configuring cloud keys

Click **Set API Key** on any cloud row in the Models view (or run `PromptRouter: Set Cloud Provider API Key`). Keys are stored in `vscode.SecretStorage` under `promptrouter.openai`, `promptrouter.gemini`, `promptrouter.perplexity`. Nothing is written to settings or disk in plain text.

> Cloud providers are **scaffolded but not implemented** in this iteration. Choosing one in the chat dropdown keeps the option disabled; selecting it programmatically will throw `Not implemented`. Replacing the `sendPrompt` body in `src/providers/cloud/*Provider.ts` is the extension point.

## Project layout

```
src/
  extension.ts              # activation, command wiring
  providers/
    modelProvider.ts        # ModelProvider interface + StreamChunk
    ollamaProvider.ts       # local provider backed by OllamaService
    cloud/                  # OpenAI, Gemini, Perplexity — stubbed
  services/
    ollamaService.ts        # HTTP client for localhost:11434
    secretsService.ts       # typed SecretStorage wrapper + change event
    modelRegistry.ts        # static catalog + live /api/tags merge
    router.ts               # modelId -> provider
    logger.ts               # OutputChannel wrapper
  ui/
    chatViewProvider.ts     # WebviewViewProvider for chat
    modelsViewProvider.ts   # WebviewViewProvider for model manager
    webview/
      shared/messages.ts    # typed postMessage protocol
      chat/                 # chat.html, chat.css, chat.ts (bundled to dist/webview/chat)
      models/               # models.html, models.css, models.ts (bundled to dist/webview/models)
  test/                     # Mocha tests, compiled to out/ by tsc -p .
```

## Architecture

```
Chat webview  -> ChatViewProvider  -> Router -> OllamaProvider  -> OllamaService -> localhost:11434
                                             -> Cloud stubs (not implemented)
Models webview -> ModelsViewProvider -> OllamaService (pull / delete / list)
                                      -> SecretsService (api keys)
                                      -> ModelRegistry (status dots)
```

## Troubleshooting

### Model installed but shown as "not installed" / grey dot

Ollama's `/api/tags` endpoint always returns the fully-qualified tag (e.g. `phi3:latest`, `llama3.2:3b`).
The extension normalizes bare tags — `phi3` → `phi3:latest` — before comparing against the installed list,
so a successful `ollama pull phi3` will surface the model correctly after the next refresh.

If the model still appears as not-installed after clicking **Refresh**:

1. Open the **PromptRouter** output channel (View → Output → PromptRouter).
2. Click **Refresh** and watch for `models refresh: start … done` lines.
3. If you see `timed out after 12s`, the Ollama daemon is not responding — run `ollama serve`.
4. If you see `Ollama listModels failed`, the daemon is running but the API returned an error — check `ollama serve` terminal output.

### Refresh button appears to do nothing

Both the Models view and the Chat view now log every refresh attempt to the **PromptRouter** output channel.
If no `chat refresh: start` or `models refresh: start` line appears when you click Refresh, the webview
message is not reaching the extension host — try reloading the window (`Developer: Reload Window`).

## Known limitations (this iteration)

- Cloud providers throw `Not implemented` from `sendPrompt`. The UI still renders them and stores keys.
- Chat history is not persisted across sessions.
- No per-request temperature / system prompt controls.
- No telemetry, no auto-update of Ollama, no auto-start of the daemon.
