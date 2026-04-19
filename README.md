# PromptRouter

Route prompts to local Ollama LLMs without leaving VSCode.

## Features

- **Chat view** in the activity bar with a model dropdown, streaming responses, and a per-message model label.
- **Models manager** with status indicators for every model:
  - Green = installed and reachable
  - Red = known but not installed
  - Grey = Ollama daemon unreachable
  - **Running** section shows models currently loaded in memory (from `/api/ps`)
- **Full Ollama integration** via the local HTTP API: list installed tags, install (pull) with streaming progress, delete, stream tokens from `/api/generate`, and inspect running models via `/api/ps`.
- **No external backend, no telemetry.** Data flows only to your local Ollama daemon.

## Requirements

- VSCode `^1.100.0`
- Node 18+ (bundled with current VSCode)
- [Ollama](https://ollama.com/) installed and running:
  ```bash
  ollama serve
  ```
  When the daemon is not reachable the extension shows a banner with that exact command and a Retry button.

### Troubleshooting `TypeError: fetch failed`

1. Confirm Ollama is listening: run `ollama serve` in a terminal.
2. The extension defaults to **`http://127.0.0.1:11434`** (IPv4 loopback). On some systems `http://localhost:11434` resolves to IPv6 (`::1`) while Ollama only binds IPv4, causing `fetch failed`.
3. If Ollama uses another host or port set **Settings → PromptRouter → Ollama Base URL** (`promptrouter.ollamaBaseUrl`) to the URL printed when Ollama starts, then run **PromptRouter: Refresh Models**.

## Install & Run (development)

```bash
npm install
npm run compile
# Press F5 in VSCode to launch the Extension Development Host
```

Available scripts:

- `npm run compile` — build the extension bundle and webview bundles into `dist/`.
- `npm run watch` — rebuild on change.
- `npm test` — run the test suite via `@vscode/test-cli` (requires a live Ollama daemon).
- `npm run lint` — ESLint over `src/`.

## Commands

| Command | What it does |
| --- | --- |
| `PromptRouter: Open Chat` | Reveals the Chat view in the activity bar. |
| `PromptRouter: Refresh Models` | Re-runs the health check and re-reads `/api/tags`. |
| `PromptRouter: Install Ollama Model` | Prompts for a tag (preset or custom) and streams `ollama pull`. |
| `PromptRouter: Remove Ollama Model` | Lists installed tags and removes the one you pick. |

## Project layout

```
src/
  core/                         # pure TypeScript — no "vscode" import
    ollama/
      client.ts                 # OllamaClient: health, list, ps, pull, delete, generate
      types.ts                  # OllamaTag, OllamaRunningModel, PullProgress, …
      tags.ts                   # canonicalTag(), ollamaModelId(), …
    models/
      manager.ts                # ModelManager: list, ps, install, remove, healthProbe
    chat/
      manager.ts                # ChatManager + ChatSession: createChat, sendPrompt, close
    logging/
      logger.ts                 # Logger interface + NullLogger
    errors.ts                   # OllamaUnreachableError, OllamaHttpError, ModelNotFoundError, SessionClosedError
  adapters/
    vscodeLogger.ts             # Logger backed by VS Code OutputChannel
    vscodeConfig.ts             # reads promptrouter.ollamaBaseUrl
  ui/
    chatViewProvider.ts         # WebviewViewProvider for Chat (thin translation layer)
    modelsViewProvider.ts       # WebviewViewProvider for Models (thin translation layer)
    webview/
      shared/messages.ts        # typed postMessage protocol
      chat/                     # chat.html, chat.css, chat.ts
      models/                   # models.html, models.css, models.ts
  extension.ts                  # composition root — wires everything together
  test/
    core/
      ollamaClient.test.ts      # OllamaClient integration tests (real daemon)
      modelManager.test.ts      # ModelManager integration tests
      chatManager.test.ts       # ChatManager / ChatSession integration tests
    support/
      ollamaEnv.ts              # OllamaEnv helper — skips suite when daemon is unreachable
```

## Architecture

```
Chat webview  ──── ChatViewProvider  ──── ChatManager  ──── OllamaClient ────► localhost:11434
Models webview ─── ModelsViewProvider ─── ModelManager ──── OllamaClient ────► localhost:11434
                                          (list / ps / install / remove / healthProbe)
extension.ts  ──── composition root (builds OllamaClient, managers, providers)
```

The `src/core/` layer has zero VS Code dependencies — enforced by the `no-restricted-imports` ESLint rule. All VS Code coupling lives in `src/adapters/` and `src/ui/`.

## Tests

Tests run against a **real Ollama daemon**; they are automatically skipped if Ollama is not reachable.  The test model (`qwen2.5:0.5b`, ~394 MiB) is pulled once per suite run and removed on teardown if it was not already installed.

```bash
npm test
```

Covered capabilities:

- Ollama is up / down (health check)
- Install model — sanity (progress events, final `success`) and error code (unknown tag)
- List models
- PS (running models) — asserted immediately after a generate call
- Remove model
- List up & running models (ModelManager merge + unavailable when offline)
- New chat session
- sendPrompt (streaming tokens)
- sendPrompt when model is down (before request)
- sendPrompt when connection drops mid-stream
- Close chat (in-flight abort + SessionClosedError on subsequent calls)
