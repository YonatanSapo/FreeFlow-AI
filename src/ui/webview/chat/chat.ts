/**
 * Chat webview — thin controller.
 *
 * Boots the UI modules, signals "ready" to the extension host, then
 * handles incoming ExtToChat messages by delegating to modules.
 *
 * NO timers, NO polling, NO visibility guessing.
 */

import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatToExt, ExtToChat } from "../shared/messages";
import { createModelSelector } from "./modules/modelSelector";
import { createBanner } from "./modules/banner";
import { createMessageList } from "./modules/messageList";
import { createComposer } from "./modules/composer";

interface VsCodeApi {
	postMessage(msg: ChatToExt): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

function post(msg: ChatToExt): void {
	vscodeApi.postMessage(msg);
}

// ---------------------------------------------------------------------------
// Markdown renderer (injected into messageList — keeps DOMPurify out of that
// module so it is independently testable).
// ---------------------------------------------------------------------------
marked.setOptions({ gfm: true, breaks: true });

function renderMd(raw: string): string {
	const html = marked.parse(raw, { async: false }) as string;
	return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// ---------------------------------------------------------------------------
// Bootstrap modules
// ---------------------------------------------------------------------------
const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;

const modelSelector = createModelSelector(modelSelect);

const banner = createBanner(
	document.getElementById("banner") as HTMLElement,
	document.getElementById("bannerText") as HTMLElement,
	document.getElementById("bannerRetry") as HTMLButtonElement,
	() => post({ type: "refresh" }),
);

const messageList = createMessageList(
	document.getElementById("messages") as HTMLElement,
	renderMd,
);

// In-flight prompt state.
let inFlight: { id: string; bodyEl: HTMLElement; md: string } | null = null;

const composer = createComposer(
	document.getElementById("input") as HTMLTextAreaElement,
	document.getElementById("sendBtn") as HTMLButtonElement,
	document.getElementById("cancelBtn") as HTMLButtonElement,
	document.getElementById("typingIndicator") as HTMLElement,
	(text) => {
		const modelId = modelSelector.getSelectedId();
		if (!modelId) {
			messageList.appendError("No runnable model selected.");
			return;
		}
		const id = uuid();
		messageList.appendUser(text);
		const bodyEl = messageList.appendAssistantShell(id);
		inFlight = { id, bodyEl, md: "" };
		composer.setInFlight(true);
		post({ type: "prompt", id, modelId, text });
	},
	() => {
		if (inFlight) {
			post({ type: "cancel", id: inFlight.id });
			inFlight = null;
			composer.setInFlight(false);
		}
	},
);

refreshBtn.addEventListener("click", () => post({ type: "refresh" }));

// ---------------------------------------------------------------------------
// Extension → webview messages
// ---------------------------------------------------------------------------
window.addEventListener("message", (event: MessageEvent<ExtToChat>) => {
	const msg = event.data;
	switch (msg.type) {
		case "models":
			modelSelector.render(msg.list);
			if (msg.health.reachable) {
				banner.hide();
			} else {
				banner.show(
					msg.health.lastError
						? `Ollama is not running: ${msg.health.lastError}`
						: "Ollama is not running. Please run: ollama serve",
				);
			}
			return;

		case "refreshing":
			refreshBtn.disabled = msg.on;
			modelSelect.disabled = msg.on;
			return;

		case "chunk":
			if (inFlight && inFlight.id === msg.id) {
				inFlight.md = messageList.appendChunk(inFlight.bodyEl, msg.delta, inFlight.md);
			}
			return;

		case "done":
			if (inFlight && inFlight.id === msg.id) {
				inFlight = null;
				composer.setInFlight(false);
			}
			return;

		case "error":
			if (inFlight && inFlight.id === msg.id) {
				messageList.appendError(msg.message, inFlight.bodyEl);
				inFlight = null;
				composer.setInFlight(false);
			} else {
				messageList.appendError(msg.message);
			}
			return;
	}
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function uuid(): string {
	return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

post({ type: "ready" });

// Signal for E2E tests: the script has fully initialised.
document.documentElement.setAttribute("data-chat-ready", "1");
