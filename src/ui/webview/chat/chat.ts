import DOMPurify from "dompurify";
import { marked } from "marked";
import type { ChatToExt, ExtToChat, ModelInfo } from "../shared/messages";

interface VsCodeApi {
	postMessage(msg: ChatToExt): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

const modelSelect = document.getElementById("modelSelect") as HTMLSelectElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;
const input = document.getElementById("input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("sendBtn") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancelBtn") as HTMLButtonElement;
const messagesEl = document.getElementById("messages") as HTMLElement;
const banner = document.getElementById("banner") as HTMLElement;
const bannerText = document.getElementById("bannerText") as HTMLElement;
const bannerRetry = document.getElementById("bannerRetry") as HTMLButtonElement;
const typingIndicator = document.getElementById("typingIndicator") as HTMLElement;

marked.setOptions({ gfm: true, breaks: true });

let models: ModelInfo[] = [];
let inFlight: { id: string; bubble: HTMLElement; md: string } | null = null;

function uuid(): string {
	return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function post(msg: ChatToExt): void {
	vscodeApi.postMessage(msg);
}

function scrollToBottom(): void {
	requestAnimationFrame(() => {
		messagesEl.scrollTop = messagesEl.scrollHeight;
	});
}

function renderModels(): void {
	const current = modelSelect.value;
	modelSelect.innerHTML = "";

	for (const m of models) {
		const opt = document.createElement("option");
		opt.value = m.id;
		opt.textContent = `${m.displayName} ${statusDot(m.status)}`;
		opt.disabled = m.status !== "installed";
		modelSelect.appendChild(opt);
	}

	if (current && models.some((m) => m.id === current)) {
		modelSelect.value = current;
	} else {
		const firstInstalled = models.find((m) => m.status === "installed");
		if (firstInstalled) {
			modelSelect.value = firstInstalled.id;
		}
	}
}

function statusDot(status: ModelInfo["status"]): string {
	switch (status) {
		case "installed":
			return "●";
		case "not-installed":
			return "○";
		case "unavailable":
			return "·";
	}
}

/** Render GitHub-flavoured Markdown into an element (sanitised). */
function renderMarkdown(element: HTMLElement, raw: string): void {
	const html = marked.parse(raw, { async: false }) as string;
	element.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
	attachCodeCopyButtons(element);
}

function attachCodeCopyButtons(root: HTMLElement): void {
	for (const pre of Array.from(root.querySelectorAll("pre"))) {
		if (pre.querySelector(":scope > .code-copy")) {
			continue;
		}
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "code-copy";
		btn.textContent = "Copy";
		btn.addEventListener("click", () => {
			const code = pre.querySelector("code");
			const text = code?.textContent ?? pre.textContent ?? "";
			void navigator.clipboard.writeText(text).then(
				() => {
					btn.textContent = "Copied!";
					window.setTimeout(() => {
						btn.textContent = "Copy";
					}, 1600);
				},
				() => {
					btn.textContent = "Failed";
					window.setTimeout(() => {
						btn.textContent = "Copy";
					}, 1600);
				},
			);
		});
		pre.appendChild(btn);
	}
}

function appendUserMessage(text: string): void {
	const wrap = document.createElement("div");
	wrap.className = "msg user";
	const body = document.createElement("div");
	body.className = "msg-body";
	body.textContent = text;
	wrap.appendChild(body);
	messagesEl.appendChild(wrap);
	scrollToBottom();
}

function appendAssistantShell(): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = "msg assistant";
	const body = document.createElement("div");
	body.className = "msg-body";
	wrap.appendChild(body);
	messagesEl.appendChild(wrap);
	scrollToBottom();
	return body;
}

function appendErrorMessage(text: string): void {
	const wrap = document.createElement("div");
	wrap.className = "msg error";
	const body = document.createElement("div");
	body.className = "msg-body";
	body.textContent = text;
	wrap.appendChild(body);
	messagesEl.appendChild(wrap);
	scrollToBottom();
}

function autoSizeTextarea(): void {
	input.style.height = "0px";
	const max = 9.5 * 16;
	const next = Math.min(input.scrollHeight, max);
	input.style.height = `${Math.max(next, 40)}px`;
}

function setInFlight(flight: boolean): void {
	sendBtn.disabled = flight;
	input.disabled = flight;
	cancelBtn.classList.toggle("hidden", !flight);
	typingIndicator.classList.toggle("hidden", !flight);
}

function send(): void {
	const text = input.value.trim();
	if (!text) {
		return;
	}
	const modelId = modelSelect.value;
	if (!modelId) {
		appendErrorMessage("No runnable model selected.");
		return;
	}

	appendUserMessage(text);
	const bubble = appendAssistantShell();
	const id = uuid();
	inFlight = { id, bubble, md: "" };
	setInFlight(true);
	post({ type: "prompt", id, modelId, text });
	input.value = "";
	autoSizeTextarea();
}

sendBtn.addEventListener("click", () => send());
cancelBtn.addEventListener("click", () => {
	if (inFlight) {
		post({ type: "cancel", id: inFlight.id });
		inFlight = null;
		setInFlight(false);
	}
});
refreshBtn.addEventListener("click", () => post({ type: "refresh" }));
bannerRetry.addEventListener("click", () => post({ type: "refresh" }));

input.addEventListener("input", () => autoSizeTextarea());

input.addEventListener("keydown", (e: KeyboardEvent) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		send();
	}
});

window.addEventListener("message", (event: MessageEvent<ExtToChat>) => {
	const msg = event.data;
	switch (msg.type) {
		case "models":
			models = msg.list;
			renderModels();
			refreshBtn.disabled = false;
			if (!msg.health.reachable) {
				banner.classList.remove("hidden");
				bannerText.textContent = msg.health.lastError
					? `Ollama is not running: ${msg.health.lastError}`
					: "Ollama is not running. Please run: ollama serve";
			} else {
				banner.classList.add("hidden");
			}
			return;
		case "chunk":
			if (inFlight && inFlight.id === msg.id) {
				inFlight.md += msg.delta;
				renderMarkdown(inFlight.bubble, inFlight.md);
				scrollToBottom();
			}
			return;
		case "done":
			if (inFlight && inFlight.id === msg.id) {
				inFlight = null;
				setInFlight(false);
			}
			return;
		case "error":
			if (inFlight && inFlight.id === msg.id) {
				const wrap = inFlight.bubble.parentElement;
				wrap?.classList.add("error");
				inFlight.bubble.textContent = msg.message;
				inFlight = null;
				setInFlight(false);
			} else {
				appendErrorMessage(msg.message);
			}
			return;
	}
});

autoSizeTextarea();
post({ type: "ready" });
