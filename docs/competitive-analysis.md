# PromptRouter — Extension Competitive Analysis Report

> April 2026 · No implementation changes included · 5 peer extensions reviewed

---

## Scope

This report audits PromptRouter against four directly comparable VS Code extensions and one LaTeX-focused outlier (TeXRA), across the following dimensions:

- `package.json` metadata completeness (categories, keywords, icon, galleryBanner, bugs, engines, license)
- Dependency footprint (runtime and dev)
- Feature coverage relative to peers
- README quality and discoverability signals
- Distribution reach (Open VSX, marketplace presence)

---

## Peers Analyzed

| Extension | Publisher | Relevance |
|---|---|---|
| **llm-vscode** | HuggingFace | Code completion + multi-provider chat (local and cloud). Most feature-rich peer. |
| **llama-vscode** | ggerganov | Minimal inline code completion via llama.cpp server. No chat UI. |
| **ollama-view** | as-cii | Activity-bar chat panel + model management for Ollama. Closest functional peer. |
| **CodeWebChat** | robertpiosik | Webview chat with file-context sharing and multi-provider routing. GPL-licensed. |
| **TeXRA** | texra-team | LaTeX AI assistant. **Excluded from direct comparisons — not a general-chat peer.** |

---

## Full Metadata Comparison

| Field | PromptRouter | llm-vscode | llama-vscode | ollama-view | CodeWebChat |
|---|---|---|---|---|---|
| `categories` | `["AI"]` | `["Machine Learning","Programming Languages"]` | — | `["Machine Learning","Other"]` | `["Other"]` |
| keyword count | 5 | 8+ | **0** | 7 | unknown |
| runtime deps | **2** | **2** | 8 | **2** | 10+ |
| `engines.vscode` | `^1.100.0` | `^1.82.0` | `^1.100.0` | `^1.85.0` | `^1.94.0` |
| license | MIT | Apache-2.0 | MIT | MIT | GPL-3.0 |
| `icon` in package.json | **MISSING** | yes | yes | yes | yes |
| `galleryBanner` | **MISSING** | yes | — | yes | — |
| `bugs` URL | **MISSING** | yes | — | yes | — |
| `activationEvents` | `onStartupFinished` | `*` | `onStartupFinished` | `[]` (lazy) | — |
| Open VSX | **no** | no | yes | yes | no |
| screenshots in README | **no** | yes | yes | yes | yes |
| status-bar indicator | no | yes | yes | no | — |
| chat history/persistence | no | no | no | yes | yes |
| system prompt support | no | no | no | yes | yes |
| generation params (temp, etc.) | no | no | no | yes | yes |

**Key signal:** PromptRouter is missing the three lowest-effort `package.json` fields (`icon`, `galleryBanner`, `bugs`) that every direct peer supplies.

---

## Section 1: Missing `package.json` Fields

### 1.1 `icon`

**Status:** Missing in PromptRouter. Present in all 4 direct peers.

The `icon` field points to a 128×128 PNG asset that is displayed:
- In VS Code Marketplace search results (the primary visual differentiator)
- On the extension's marketplace detail page
- In the VS Code "Extensions" sidebar when installed

Without it, PromptRouter renders a generic grey puzzle-piece placeholder. This is the single most visible signal of a "draft" vs "production" extension to marketplace visitors.

**Field to add:**
```json
"icon": "images/icon.png"
```
Plus a `128×128` PNG asset at that path.

---

### 1.2 `galleryBanner`

**Status:** Missing. Present in llm-vscode and ollama-view.

`galleryBanner` sets the background color and text theme of the header strip on the marketplace detail page. The default is an unstyled white/grey strip. A dark-toned banner consistent with VS Code's own UI creates a polished, intentional impression.

**Field to add:**
```json
"galleryBanner": {
  "color": "#1e1e2e",
  "theme": "dark"
}
```

The exact color should be chosen to complement the extension icon.

---

### 1.3 `bugs`

**Status:** Missing. Present in llm-vscode and ollama-view.

The `bugs` field drives the "Issues" tab on the marketplace listing. Without it, the tab is absent and users who encounter a problem have no obvious path to report it. This reduces trust and increases the likelihood that negative experiences are left unreported rather than addressed.

**Field to add:**
```json
"bugs": {
  "url": "https://github.com/YonatanSapo/FreeFlow-AI/issues"
}
```

---

## Section 2: Categories & Keywords Deep-Dive

### 2.1 Categories

| Extension | categories |
|---|---|
| PromptRouter | `["AI"]` |
| llm-vscode | `["Machine Learning", "Programming Languages"]` |
| ollama-view | `["Machine Learning", "Other"]` |
| llama-vscode | (none listed) |
| CodeWebChat | `["Other"]` |

**Assessment:** PromptRouter's `"AI"` category is the correct primary category for marketplace browsing. This was updated from `"Other"` in the recent audit and is now ahead of CodeWebChat and teXRA on this axis. llm-vscode using `"Machine Learning"` additionally is reasonable but `"AI"` is the more natural fit for an end-user chat tool.

**Recommendation:** Keep `["AI"]`. Optionally consider adding `"Machine Learning"` as a secondary category but `"AI"` is the higher-traffic browse path.

---

### 2.2 Keywords

**Current PromptRouter keywords (5):**
`ollama`, `llm`, `chat`, `ai`, `local`

**Peer comparison:**

| Extension | Keywords | Count |
|---|---|---|
| PromptRouter | ollama, llm, chat, ai, local | 5 |
| llm-vscode | ai, llm, copilot, assistant, openai, claude, gpt, code, ... | 8+ |
| llama-vscode | (none) | 0 |
| ollama-view | ollama, ai, chat, local, llm, model, tool | 7 |

**Proposed expanded set (12 terms):**

| Keyword | Status | Rationale |
|---|---|---|
| `ollama` | keep | Core brand term |
| `llm` | keep | Broad AI category term |
| `chat` | keep | Primary UX pattern |
| `ai` | keep | Broadest discovery term |
| `local` | keep | Core differentiator |
| `local-ai` | **add** | Emerging compound search term in the llama.cpp / Ollama community |
| `assistant` | **add** | Highest-traffic AI extension search term; used by top-ranked extensions |
| `mistral` | **add** | Users actively search for extensions by model family name |
| `llama` | **add** | Same rationale as mistral (llama.cpp / Meta Llama models) |
| `qwen` | **add** | Growing model family with high Ollama usage |
| `privacy` | **add** | Core value proposition of running models locally — differentiates from cloud |
| `offline` | **add** | Same rationale as privacy; important for air-gapped and enterprise users |

VS Code Marketplace supports up to ~30 keywords. Expanding from 5 to 12 is well within limits.

---

## Section 3: `engines.vscode` Analysis

| Extension | Minimum vscode | Approx. release date |
|---|---|---|
| PromptRouter | `^1.100.0` | Jan 2025 |
| llama-vscode | `^1.100.0` | Jan 2025 |
| CodeWebChat | `^1.94.0` | Jul 2024 |
| ollama-view | `^1.85.0` | Oct 2023 |
| llm-vscode | `^1.82.0` | May 2023 |

**Advantages of `^1.100.0`:**
- Access to all modern Webview APIs, CSP nonce improvements, and command `category` fields that were used in the recent audit.
- No polyfills or feature-detection code needed.
- VS Code auto-updates silently for the majority of users.

**Trade-off:**
- llm-vscode targets `^1.82.0`, capturing enterprise-managed VS Code installations that lag behind by 12–18 months.
- If user feedback surfaces install failures on older installs, lowering to `^1.85.0` or `^1.90.0` would recover that audience with minimal API-compatibility work.

**Verdict:** Keep `^1.100.0`. No change needed unless specific version-incompatibility reports arrive.

---

## Section 4: License Comparison

| Extension | License | Implication |
|---|---|---|
| PromptRouter | **MIT** | Maximally permissive. Commercial use, forking, and redistribution allowed without restriction. |
| llm-vscode | Apache-2.0 | Permissive with explicit patent grant. No copyleft. |
| llama-vscode | MIT | Same as PromptRouter. |
| ollama-view | MIT | Same as PromptRouter. |
| CodeWebChat | **GPL-3.0** | Copyleft — any derivative must also be GPL. Blocks commercial re-use and many enterprise deployments. |
| TeXRA | **Proprietary** | No redistribution rights. |

**Competitive advantage:** MIT is the ecosystem default and the correct choice. CodeWebChat's GPL-3.0 is a liability: legal review at many organisations blocks GPL tools. PromptRouter's MIT license is a concrete differentiator for corporate users.

**Verdict:** No change needed.

---

## Section 5: Dependency Audit

### Runtime dependencies

| Extension | Runtime dep count | Key packages |
|---|---|---|
| **PromptRouter** | **2** | dompurify, marked |
| **llm-vscode** | **2** | axios, uuid |
| **ollama-view** | **2** | marked, dompurify |
| llama-vscode | 8 | node-fetch, llama.cpp native bindings |
| CodeWebChat | 10+ | react, react-dom, tailwindcss, various |
| TeXRA | 30+ | LaTeX PDF processing, academic toolchain wrappers |

**Assessment:** PromptRouter's 2-dep footprint is best-in-class, tied with the two most carefully maintained peers. This is a real quality signal:
- Smaller bundle size (faster first activation)
- Fewer transitive vulnerabilities
- Simpler dependency audit for enterprise security teams

The decision to use `dompurify` + `marked` instead of a React webview framework is architecturally sound and matches ollama-view's approach exactly.

### Dev dependencies

PromptRouter: ~22 dev deps. Comparable to llm-vscode (~30) and ollama-view (~25). No concerns.

---

## Section 6: Feature Gap Analysis

| Feature | Peers with it | User value | Effort | Priority |
|---|---|---|---|---|
| Extension icon (128×128 PNG) | All 4 peers | **High** — primary marketplace visual | 1–2 h | **P0** |
| `galleryBanner` in package.json | llm-vscode, ollama-view | Medium — branded marketplace header | 30 min | **P0** |
| `bugs` URL in package.json | llm-vscode, ollama-view | Medium — lowers issue-report friction | 15 min | **P0** |
| Screenshots / GIF in README | llm-vscode, llama-vscode, ollama-view | **High** — primary install decision signal | 2–4 h | **P1** |
| Marketplace badges in README | llm-vscode, ollama-view | Medium — shows version, installs, license | 30 min | **P1** |
| Open VSX Registry | llama-vscode, ollama-view | Medium — Cursor, VSCodium, Gitpod users | 1 h | **P1** |
| Expanded keywords (12 total) | llm-vscode exceeds this | Medium — search ranking improvement | 15 min | **P1** |
| Status-bar model indicator | llm-vscode, llama-vscode | Low — quick visual for active model | 4–8 h | **P2** |
| Chat history / persistence | ollama-view, CodeWebChat | **High** — users expect sessions to survive reloads | 1–2 days | **P2** |
| System prompt / model framing | ollama-view, CodeWebChat | **High** — power-user differentiator | 1 day | **P2** |
| Temperature & generation params | ollama-view, CodeWebChat | Medium — model behaviour fine-tuning | 0.5–1 day | **P3** |
| Multiple named chat sessions | ollama-view, CodeWebChat | Medium — workspace context separation | 2–3 days | **P3** |
| Chat export (markdown / JSON) | ollama-view | Low — niche but well-received | 0.5 day | **P3** |

---

## Section 7: README Audit

### Current README strengths
- Clear installation steps (marketplace + VSIX)
- Configuration table with the IPv4/IPv6 note (directly addresses a common failure mode)
- Commands table (complete as of recent update)
- Clean formatting

### Missing sections

| Section | Current state | Recommended addition | Effort |
|---|---|---|---|
| Hero screenshot / GIF | Absent | Animated GIF of chat panel in use (prompt typed → streamed response) | 2–4 h |
| Marketplace badges | Absent | Version, installs, rating, license badge row below title | 30 min |
| Keyboard shortcuts | Absent | Document Cmd+Shift+P flow and any direct keybindings | 30 min |
| Troubleshooting section | Single config note | 4–5 common failure modes with solutions | 1 h |
| Open VSX install tab | VS Code only | Add Cursor / VSCodium install command and badge | 15 min |
| Contribution / build guide | Absent | Link to CONTRIBUTING.md or a "Build from source" block | 30 min |
| Changelog link | Absent | Reference to CHANGELOG.md near the bottom | 15 min |

### Detailed notes

**Hero screenshot / GIF**
ollama-view's README opens with an animated GIF showing the full UX flow. VS Code Marketplace renders the first image prominently on the listing page. Users decide in under 3 seconds whether to install. A 30-second GIF showing:
1. Clicking the PromptRouter icon in the activity bar
2. Typing a prompt into the Chat panel
3. Watching the response stream token by token
4. Switching models in the Models panel

...would be the single highest-impact README change available.

**Marketplace badges**
Standard pattern used by llm-vscode and others. Add below the title:
```markdown
[![Version](https://img.shields.io/visual-studio-marketplace/v/freeflow-ai.freeflow-ai)](https://marketplace.visualstudio.com/items?itemName=freeflow-ai.freeflow-ai)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/freeflow-ai.freeflow-ai)](https://marketplace.visualstudio.com/items?itemName=freeflow-ai.freeflow-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
```

**Troubleshooting expansion**
Current README only mentions the IPv4 URL fix inside the configuration description. A dedicated `## Troubleshooting` section should cover:

1. **Ollama daemon not running** — `ollama serve` command to start it
2. **Model not yet pulled** — use `PromptRouter: Install Ollama Model` or `ollama pull <tag>`
3. **"fetch failed" on localhost** — change base URL to `http://127.0.0.1:11434`
4. **Slow first response** — model is cold-starting; subsequent tokens are faster
5. **Extension not activating** — check VS Code version `>= 1.100.0`

**Open VSX**
Cursor and VSCodium users cannot install from the VS Code Marketplace. ollama-view and llama-vscode are both published to Open VSX. Given PromptRouter's local-AI positioning, Cursor users are a natural audience. The publish command is:

```bash
npx ovsx publish --pat <OPEN_VSX_TOKEN>
```

A corresponding `open-vsx` badge and install tab in the README should be added at the same time.

---

## Section 8: TeXRA — Exclusion Rationale

TeXRA is a LaTeX research assistant. While it was included in the initial analysis scope, it does not represent a meaningful competitive reference for PromptRouter for the following reasons:

- **Different use case:** LaTeX document writing vs general-purpose AI chat
- **Different audience:** Academic researchers vs software developers
- **Proprietary license:** Cannot be used as a pattern reference
- **30+ runtime deps:** Driven by PDF/LaTeX processing, not applicable
- **Keywords:** All LaTeX-domain-specific

No conclusions about metadata, features, or distribution strategy should be drawn from TeXRA.

---

## Section 9: Priority Action Summary

### P0 — Under 2 hours total, maximum impact on marketplace presentation

1. **Add extension icon** — Create `images/icon.png` (128×128 PNG). Add `"icon"` field to `package.json`. This is present in all 4 direct peers and is the most visible gap in PromptRouter's marketplace listing.

2. **Add `galleryBanner`** — One JSON field, 30 minutes. Brands the marketplace header strip.

3. **Add `bugs` URL** — One JSON field, 15 minutes. Enables the "Issues" tab on the marketplace listing.

### P1 — Under 5 hours total, high discoverability impact

4. **Add hero screenshot / GIF to README** — The primary install-decision signal. A 30-second recording of the chat flow is sufficient.

5. **Expand keywords from 5 to 12** — Add: `local-ai`, `assistant`, `mistral`, `llama`, `qwen`, `privacy`, `offline`. 15 minutes, directly improves search ranking.

6. **Publish to Open VSX Registry** — Reaches Cursor, VSCodium, and Gitpod users. `npx ovsx publish` after acquiring an Open VSX PAT.

7. **Add marketplace badges to README** — Version, installs, and license. 30 minutes.

### P2 — 1–3 days development, significant feature value

8. **Chat history persistence** — The most-cited functional gap in Ollama extension reviews. Store conversations in `globalState` or a workspace file.

9. **System prompt / model framing** — A configuration field or editable textarea for a persistent system prompt. Differentiates from raw terminal `ollama run`.

### P3 — Roadmap items, lower urgency

10. **Temperature & generation parameter controls**
11. **Multiple named chat sessions**
12. **Chat export (markdown / JSON)**

---

*Report generated April 2026. Sources: VS Code Marketplace, Open VSX Registry, extension GitHub repositories, and `package.json` manifests.*
