import type { ExtToModels, ModelInfo, ModelsToExt } from "../shared/messages";

interface VsCodeApi {
	postMessage(msg: ModelsToExt): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

const localList = document.getElementById("localList") as HTMLUListElement;
const cloudList = document.getElementById("cloudList") as HTMLUListElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;
const ollamaRow = document.getElementById("ollamaRow") as HTMLElement;
const ollamaInstructions = document.getElementById("ollamaInstructions") as HTMLElement;
const toast = document.getElementById("toast") as HTMLElement;

let models: ModelInfo[] = [];
const rowsById = new Map<string, HTMLLIElement>();

function post(msg: ModelsToExt): void {
	vscodeApi.postMessage(msg);
}

function showToast(message: string, kind: "info" | "error" = "info"): void {
	toast.textContent = message;
	toast.classList.remove("hidden");
	toast.dataset.kind = kind;
	window.setTimeout(() => toast.classList.add("hidden"), 2500);
}

function renderLocalRow(model: ModelInfo): HTMLLIElement {
	const li = document.createElement("li");
	li.className = "row";
	li.dataset.modelId = model.id;

	const dot = document.createElement("span");
	dot.className = `dot ${model.status}`;
	dot.title = statusLabel(model.status);

	const name = document.createElement("span");
	name.className = "name";
	name.textContent = model.displayName;

	const actions = document.createElement("span");
	actions.className = "actions";

	if (model.status === "running") {
		const removeBtn = document.createElement("button");
		removeBtn.textContent = "Remove";
		removeBtn.addEventListener("click", () => {
			if (!model.tag) {
				return;
			}
			post({ type: "remove", tag: model.tag });
		});
		actions.appendChild(removeBtn);
	} else if (model.status === "not-installed") {
		const installBtn = document.createElement("button");
		installBtn.textContent = "Install";
		installBtn.addEventListener("click", () => {
			if (!model.tag) {
				return;
			}
			installBtn.disabled = true;
			post({ type: "install", tag: model.tag });
		});
		actions.appendChild(installBtn);
	}

	li.appendChild(dot);
	li.appendChild(name);
	li.appendChild(actions);
	return li;
}

function renderCloudRow(model: ModelInfo): HTMLLIElement {
	const li = document.createElement("li");
	li.className = "row";
	li.dataset.modelId = model.id;

	const dot = document.createElement("span");
	dot.className = `dot ${model.status}`;
	dot.title = statusLabel(model.status);

	const name = document.createElement("span");
	name.className = "name";
	name.textContent = model.displayName;

	const actions = document.createElement("span");
	actions.className = "actions";

	const setKeyBtn = document.createElement("button");
	setKeyBtn.textContent = model.status === "unavailable" ? "Set API Key" : "Update Key";
	setKeyBtn.addEventListener("click", () => post({ type: "setKey", modelId: model.id }));
	actions.appendChild(setKeyBtn);

	if (model.status !== "unavailable") {
		const clearBtn = document.createElement("button");
		clearBtn.textContent = "Clear";
		clearBtn.addEventListener("click", () => post({ type: "clearKey", modelId: model.id }));
		actions.appendChild(clearBtn);
	}

	const validateBtn = document.createElement("button");
	validateBtn.textContent = "Validate";
	validateBtn.disabled = true;
	validateBtn.title = "Not yet implemented";
	actions.appendChild(validateBtn);

	li.appendChild(dot);
	li.appendChild(name);
	li.appendChild(actions);
	return li;
}

function copyToClipboard(text: string): void {
	void navigator.clipboard.writeText(text);
}

function makeCopyBtn(command: string): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.textContent = "Copy";
	btn.className = "copy-btn";
	btn.title = `Copy: ${command}`;
	btn.addEventListener("click", () => copyToClipboard(command));
	return btn;
}

function makeInstRow(label: string, command: string): HTMLDivElement {
	const row = document.createElement("div");
	row.className = "inst-row";
	const lbl = document.createElement("span");
	lbl.className = "inst-label";
	lbl.textContent = label;
	const code = document.createElement("code");
	code.textContent = command;
	row.appendChild(lbl);
	row.appendChild(code);
	row.appendChild(makeCopyBtn(command));
	return row;
}

function makeInstOr(text: string): HTMLDivElement {
	const d = document.createElement("div");
	d.className = "inst-or";
	d.textContent = text;
	return d;
}

function makeInstHeading(text: string): HTMLDivElement {
	const d = document.createElement("div");
	d.className = "inst-heading";
	d.textContent = text;
	return d;
}

function buildInstructions(platform: string): DocumentFragment {
	const frag = document.createDocumentFragment();
	const isMac = platform === "darwin";
	const isWin = platform === "win32";

	frag.appendChild(makeInstHeading("Install Ollama"));
	if (isMac) {
		frag.appendChild(makeInstRow("Homebrew:", "brew install ollama"));
		frag.appendChild(makeInstOr("— or — download from https://ollama.com/download/mac"));
	} else if (isWin) {
		frag.appendChild(makeInstRow("winget:", "winget install Ollama.Ollama"));
		frag.appendChild(makeInstOr("— or — download from https://ollama.com/download/windows"));
	} else {
		frag.appendChild(makeInstRow("Linux:", "curl -fsSL https://ollama.com/install.sh | sh"));
		frag.appendChild(makeInstOr("— or — https://ollama.com/download"));
	}

	frag.appendChild(makeInstHeading("Start the daemon"));
	frag.appendChild(makeInstRow("Terminal:", "ollama serve"));
	if (isMac) {
		frag.appendChild(makeInstOr("— or — launch Ollama.app from your Applications folder"));
	} else if (isWin) {
		frag.appendChild(makeInstOr("— or — start Ollama from the Start Menu"));
	}

	return frag;
}

function renderDaemonRow(reachable: boolean, platform: string): void {
	ollamaRow.innerHTML = "";
	ollamaInstructions.innerHTML = "";

	const dot = document.createElement("span");
	const nameEl = document.createElement("span");
	nameEl.className = "name";
	nameEl.textContent = "Ollama Daemon";

	const statusEl = document.createElement("span");
	statusEl.className = "daemon-status";

	if (reachable) {
		dot.className = "dot running";
		dot.title = "running";
		statusEl.textContent = "running";
		ollamaInstructions.classList.add("hidden");
	} else {
		dot.className = "dot not-installed";
		dot.title = "not running";
		statusEl.textContent = "not running";
		ollamaInstructions.appendChild(buildInstructions(platform));
		ollamaInstructions.classList.remove("hidden");
	}

	ollamaRow.appendChild(dot);
	ollamaRow.appendChild(nameEl);
	ollamaRow.appendChild(statusEl);
}

function statusLabel(status: ModelInfo["status"]): string {
	switch (status) {
		case "running":
			return "running";
		case "not-installed":
			return "not installed";
		case "unavailable":
			return "not configured / unreachable";
	}
}

function renderAll(): void {
	localList.innerHTML = "";
	cloudList.innerHTML = "";
	rowsById.clear();
	for (const m of models) {
		const row = m.type === "local" ? renderLocalRow(m) : renderCloudRow(m);
		rowsById.set(m.id, row);
		(m.type === "local" ? localList : cloudList).appendChild(row);
	}
}

function setRowProgress(modelId: string, status: string, completed?: number, total?: number): void {
	const row = rowsById.get(modelId);
	if (!row) {
		return;
	}
	let progress = row.querySelector<HTMLDivElement>(".progress");
	let label = row.querySelector<HTMLDivElement>(".progress-label");
	if (!progress) {
		progress = document.createElement("div");
		progress.className = "progress";
		const bar = document.createElement("span");
		bar.className = "progress-bar";
		progress.appendChild(bar);
		row.appendChild(progress);
	}
	if (!label) {
		label = document.createElement("div");
		label.className = "progress-label";
		row.appendChild(label);
	}
	const bar = progress.querySelector<HTMLSpanElement>(".progress-bar");
	if (bar && total && completed !== undefined) {
		const pct = Math.max(0, Math.min(100, (completed / total) * 100));
		bar.style.width = `${pct}%`;
	}
	label.textContent = status;
}

function clearRowProgress(modelId: string): void {
	const row = rowsById.get(modelId);
	if (!row) {
		return;
	}
	row.querySelector(".progress")?.remove();
	row.querySelector(".progress-label")?.remove();
}

function renderDaemonLoading(): void {
	ollamaRow.innerHTML = "";
	const dot = document.createElement("span");
	dot.className = "dot unavailable";
	dot.title = "checking…";
	const nameEl = document.createElement("span");
	nameEl.className = "name";
	nameEl.textContent = "Ollama Daemon";
	const statusEl = document.createElement("span");
	statusEl.className = "daemon-status";
	statusEl.textContent = "checking…";
	ollamaRow.appendChild(dot);
	ollamaRow.appendChild(nameEl);
	ollamaRow.appendChild(statusEl);
	ollamaInstructions.classList.add("hidden");
}

refreshBtn.addEventListener("click", () => post({ type: "refresh" }));

window.addEventListener("message", (event: MessageEvent<ExtToModels>) => {
	const msg = event.data;
	switch (msg.type) {
		case "models":
			models = msg.list;
			renderAll();
			renderDaemonRow(msg.health.reachable, msg.health.platform);
			return;
		case "pullProgress":
			setRowProgress(msg.modelId, msg.status, msg.completed, msg.total);
			return;
		case "pullDone":
			clearRowProgress(msg.modelId);
			showToast("Install complete");
			return;
		case "pullError":
			clearRowProgress(msg.modelId);
			showToast(`Install failed: ${msg.message}`, "error");
			return;
		case "info":
			showToast(msg.message, "info");
			return;
		case "error":
			showToast(msg.message, "error");
			return;
	}
});

renderDaemonLoading();
post({ type: "ready" });
