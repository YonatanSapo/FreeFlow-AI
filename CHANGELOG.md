# Change Log

All notable changes to the "freeflow-ai" (FreeFlow-AI) extension are documented here.

Format follows [Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Changed
- `ModelStatus`, `ModelInfo`, and `RunningModel` types now have a single canonical definition in `src/core/models/manager.ts`; `src/ui/webview/shared/messages.ts` re-exports them instead of duplicating the declarations.
- `ChatViewProvider` and `ModelsViewProvider` now accept `Logger & { show(): void }` instead of the concrete `VSCodeLogger` class, honoring the dependency-inversion principle.
- Extracted shared `createNonce()` and `buildWebviewHtml()` helpers into `src/ui/webviewUtils.ts`, eliminating identical implementations that existed in both view providers.
- ESLint rules `curly`, `eqeqeq`, `no-throw-literal`, and `semi` promoted from `warn` to `error`.
- Webview webpack bundle now uses `extensionAlias` for `.js` → `.ts` resolution, consistent with the extension bundle.
- Fixed chat webview textarea `placeholder` attribute (was accidentally set to a developer username; now reads `Ask anything…`).

### Removed
- `ModelNotFoundError` — exported from `src/core/errors.ts` but never thrown or tested in the codebase.
- `scripts/manual-ollama-run.sh` — personal scratch script with typos and a non-existent model tag; not referenced from `package.json`.
- `vsc-extension-quickstart.md` — default Yeoman template file with no project-specific content; already excluded from the published extension via `.vscodeignore`.

## [0.1.4] — initial public release

### Added
- **Chat view** in the activity bar with a model dropdown and streaming responses rendered as Markdown (via `marked` + `DOMPurify`). Copy-to-clipboard buttons on code blocks.
- **Models manager** with per-model status indicators (installed / not-installed / unavailable / running in memory).
- **Full Ollama HTTP integration**: `GET /api/tags`, `GET /api/ps`, `POST /api/pull` (streaming progress), `DELETE /api/delete`, `POST /api/generate` (streaming tokens).
- **Commands**: `FreeFlow-AI: Open Chat`, `FreeFlow-AI: Open Models`, `FreeFlow-AI: Refresh Models`, `FreeFlow-AI: Install Ollama Model`, `FreeFlow-AI: Remove Ollama Model`.
- **`freeflow-ai.ollamaBaseUrl` setting** — defaults to `http://127.0.0.1:11434`.
- **Offline banner** with platform-specific install instructions and a Retry button.
- **No external backend, no telemetry** — all data flows only to the local Ollama daemon.
- Three-layer test suite: unit tests (JSDOM webview tests + stub-based core unit tests), integration tests against a live Ollama daemon, and DOM E2E tests via WebdriverIO + wdio-vscode-service.
- `npm run manual` CLI for ad-hoc debugging of `src/core/` against a real daemon.
