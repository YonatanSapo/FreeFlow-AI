import type { ExtToModels, ModelInfo, ModelsToExt, RunningModel } from "../shared/messages";

interface VsCodeApi {
	postMessage(msg: ModelsToExt): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

const localList = document.getElementById("localList") as HTMLUListElement;
const runningList = document.getElementById("runningList") as HTMLUListElement;
const runningSection = document.getElementById("runningSection") as HTMLElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;
const ollamaDot = document.getElementById("ollamaDot") as HTMLSpanElement;
const ollamaStatus = document.getElementById("ollamaStatus") as HTMLSpanElement;
const ollamaInstructions = document.getElementById("ollamaInstructions") as HTMLElement;
const toast = document.getElementById("toast") as HTMLElement;

let models: ModelInfo[] = [];
const rowsById = new Map<string, HTMLLIElement>();
let receivedModelsFrame = false;

function post(msg: ModelsToExt): void {
	vscodeApi.postMessage(msg);
}

function showToast(message: string, kind: "info" | "error" = "info"): void {
	toast.textContent = message;
	toast.classList.remove("hidden");
	toast.dataset.kind = kind;
	window.setTimeout(() => toast.classList.add("hidden"), 2500);
}

function bytesToMib(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(0)} MiB`;
}

function renderLocalRow(model: ModelInfo): HTMLLIElement {
	const li = document.createElement("li");
	li.className = "row";
	li.dataset.modelId = model.id;

	const dot = document.createElement("span");
	dot.className = `dot ${model.status === "installed" ? "running" : model.status}`;
	dot.title = statusLabel(model.status);

	const name = document.createElement("span");
	name.className = "name";
	name.textContent = model.displayName;

	const actions = document.createElement("span");
	actions.className = "actions";

	if (model.status === "installed") {
		const removeBtn = document.createElement("button");
		removeBtn.textContent = "Remove";
		removeBtn.addEventListener("click", () => {
			post({ type: "remove", tag: model.tag });
		});
		actions.appendChild(removeBtn);
	} else if (model.status === "not-installed") {
		const installBtn = document.createElement("button");
		installBtn.textContent = "Install";
		installBtn.addEventListener("click", () => {
			post({ type: "install", tag: model.tag });
		});
		actions.appendChild(installBtn);
	}

	li.appendChild(dot);
	li.appendChild(name);
	li.appendChild(actions);
	return li;
}

function renderRunningRow(m: RunningModel): HTMLLIElement {
	const li = document.createElement("li");
	li.className = "row";

	const dot = document.createElement("span");
	dot.className = "dot running";
	dot.title = "loaded in memory";

	const name = document.createElement("span");
	name.className = "name";
	name.textContent = m.name;

	const size = document.createElement("span");
	size.className = "running-size";
	size.textContent = bytesToMib(m.size);

	li.appendChild(dot);
	li.appendChild(name);
	li.appendChild(size);
	return li;
}

function makeCopyBtn(command: string): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.textContent = "Copy";
	btn.className = "copy-btn";
	btn.title = `Copy: ${command}`;
	btn.addEventListener("click", () => void navigator.clipboard.writeText(command));
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

function renderDaemonHeader(reachable: boolean, platform: string, lastError?: string): void {
	ollamaInstructions.innerHTML = "";
	if (reachable) {
		ollamaDot.className = "dot running";
		ollamaDot.title = "running";
		ollamaStatus.textContent = "running";
		ollamaInstructions.classList.add("hidden");
	} else {
		ollamaDot.className = "dot not-installed";
		ollamaDot.title = "not running";
		ollamaStatus.textContent = lastError ? `not running — ${lastError}` : "not running";
		ollamaInstructions.appendChild(buildInstructions(platform));
		ollamaInstructions.classList.remove("hidden");
	}
}

function renderHeaderLoading(): void {
	ollamaDot.className = "dot unavailable";
	ollamaDot.title = "checking…";
	ollamaStatus.textContent = "checking…";
	ollamaInstructions.innerHTML = "";
	ollamaInstructions.classList.add("hidden");
}

function renderNoHostResponse(): void {
	ollamaInstructions.innerHTML = "";
	ollamaDot.className = "dot not-installed";
	ollamaDot.title = "no response";
	ollamaStatus.textContent = "not running — no response from extension";
	ollamaInstructions.classList.add("hidden");
}

function statusLabel(status: ModelInfo["status"]): string {
	switch (status) {
		case "installed":
			return "installed";
		case "not-installed":
			return "not installed";
		case "unavailable":
			return "Ollama unreachable";
	}
}

function renderAll(running: RunningModel[]): void {
	localList.innerHTML = "";
	rowsById.clear();

	for (const m of models) {
		const row = renderLocalRow(m);
		rowsById.set(m.id, row);
		localList.appendChild(row);
	}

	runningList.innerHTML = "";
	if (running.length > 0) {
		runningSection.classList.remove("hidden");
		for (const r of running) {
			runningList.appendChild(renderRunningRow(r));
		}
	} else {
		runningSection.classList.add("hidden");
	}
}

function setRowProgress(modelId: string, status: string | undefined, completed?: number, total?: number): void {
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
	label.textContent = status ?? "downloading";
}

function clearRowProgress(modelId: string): void {
	const row = rowsById.get(modelId);
	if (!row) {
		return;
	}
	row.querySelector(".progress")?.remove();
	row.querySelector(".progress-label")?.remove();
}

function setRefreshing(on: boolean): void {
	refreshBtn.disabled = on;
	refreshBtn.classList.toggle("refreshing", on);
	refreshBtn.textContent = on ? "Refreshing…" : "Refresh";
	if (on) {
		renderHeaderLoading();
	}
}

refreshBtn.addEventListener("click", () => post({ type: "refresh" }));

window.addEventListener("message", (event: MessageEvent<ExtToModels>) => {
	const msg = event.data;
	switch (msg.type) {
		case "models":
			receivedModelsFrame = true;
			models = msg.list;
			renderAll(msg.running);
			renderDaemonHeader(msg.health.reachable, msg.health.platform, msg.health.lastError);
			return;
		case "refreshing":
			setRefreshing(msg.on);
			if (!msg.on && !receivedModelsFrame) {
				renderNoHostResponse();
			}
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

renderHeaderLoading();
post({ type: "ready" });
