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

let models: ModelInfo[] = [];
let inFlight: { id: string; bubble: HTMLElement } | null = null;

function uuid(): string {
	return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function post(msg: ChatToExt): void {
	vscodeApi.postMessage(msg);
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

function appendMessage(role: "user" | "assistant" | "error", label: string, text: string): HTMLElement {
	const wrap = document.createElement("div");
	wrap.className = `msg ${role}`;
	const meta = document.createElement("div");
	meta.className = "msg-meta";
	meta.textContent = label;
	const body = document.createElement("div");
	body.className = "msg-body";
	body.textContent = text;
	wrap.appendChild(meta);
	wrap.appendChild(body);
	messagesEl.appendChild(wrap);
	messagesEl.scrollTop = messagesEl.scrollHeight;
	return body;
}

function setInFlight(flight: boolean): void {
	sendBtn.disabled = flight;
	input.disabled = flight;
	cancelBtn.classList.toggle("hidden", !flight);
}

function send(): void {
	const text = input.value.trim();
	if (!text) {
		return;
	}
	const modelId = modelSelect.value;
	if (!modelId) {
		appendMessage("error", "system", "No runnable model selected.");
		return;
	}
	const selected = models.find((m) => m.id === modelId);
	const label = selected ? selected.displayName : modelId;

	appendMessage("user", "You", text);
	const bubble = appendMessage("assistant", label, "");
	const id = uuid();
	inFlight = { id, bubble };
	setInFlight(true);
	post({ type: "prompt", id, modelId, text });
	input.value = "";
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

input.addEventListener("keydown", (e: KeyboardEvent) => {
	if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
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
				inFlight.bubble.textContent = (inFlight.bubble.textContent ?? "") + msg.delta;
				messagesEl.scrollTop = messagesEl.scrollHeight;
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
				inFlight.bubble.parentElement?.classList.add("error");
				inFlight.bubble.textContent = msg.message;
				inFlight = null;
				setInFlight(false);
			} else {
				appendMessage("error", "error", msg.message);
			}
			return;
	}
});

post({ type: "ready" });
