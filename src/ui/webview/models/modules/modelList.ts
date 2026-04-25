/**
 * Model list module: local model rows with Install/Remove buttons and
 * pull-progress bars. Accepts DOM elements so it is testable in JSDOM
 * without global `document`.
 */

import type { ModelInfo } from "../../shared/messages";

export interface ModelList {
	render(models: ModelInfo[]): void;
	setProgress(modelId: string, status?: string, completed?: number, total?: number): void;
	clearProgress(modelId: string): void;
}

export function createModelList(
	localList: HTMLUListElement,
	onInstall: (tag: string) => void,
	onRemove: (tag: string) => void,
): ModelList {
	const doc = localList.ownerDocument;
	const rowsById = new Map<string, HTMLLIElement>();

	function statusLabel(status: ModelInfo["status"]): string {
		switch (status) {
			case "installed":     return "installed";
			case "not-installed": return "not installed";
			case "unavailable":   return "Ollama unreachable";
		}
	}

	function renderLocalRow(model: ModelInfo): HTMLLIElement {
		const li = doc.createElement("li") as HTMLLIElement;
		li.className = "row";
		li.dataset.modelId = model.id;

		const dot = doc.createElement("span");
		dot.className = `dot ${model.status === "installed" ? "running" : model.status}`;
		dot.title = statusLabel(model.status);

		const name = doc.createElement("span");
		name.className = "name";
		name.textContent = model.displayName;

		const actions = doc.createElement("span");
		actions.className = "actions";

		if (model.status === "installed") {
			const btn = doc.createElement("button") as HTMLButtonElement;
			btn.textContent = "Remove";
			btn.addEventListener("click", () => onRemove(model.tag));
			actions.appendChild(btn);
		} else if (model.status === "not-installed") {
			const btn = doc.createElement("button") as HTMLButtonElement;
			btn.textContent = "Install";
			btn.addEventListener("click", () => onInstall(model.tag));
			actions.appendChild(btn);
		}

		li.appendChild(dot);
		li.appendChild(name);
		li.appendChild(actions);
		return li;
	}

	return {
		render(models: ModelInfo[]) {
			localList.innerHTML = "";
			rowsById.clear();

			for (const m of models) {
				const row = renderLocalRow(m);
				rowsById.set(m.id, row);
				localList.appendChild(row);
			}
		},

		setProgress(modelId: string, status?: string, completed?: number, total?: number) {
			const row = rowsById.get(modelId);
			if (!row) { return; }

			let progress = row.querySelector<HTMLDivElement>(".progress");
			let progressLabel = row.querySelector<HTMLDivElement>(".progress-label");

			if (!progress) {
				progress = doc.createElement("div") as HTMLDivElement;
				progress.className = "progress";
				const bar = doc.createElement("span");
				bar.className = "progress-bar";
				progress.appendChild(bar);
				row.appendChild(progress);
			}
			if (!progressLabel) {
				progressLabel = doc.createElement("div") as HTMLDivElement;
				progressLabel.className = "progress-label";
				row.appendChild(progressLabel);
			}

			const bar = progress.querySelector<HTMLSpanElement>(".progress-bar");
			if (bar && total && completed !== undefined) {
				const pct = Math.max(0, Math.min(100, (completed / total) * 100));
				bar.style.width = `${pct}%`;
			}
			progressLabel.textContent = status ?? "downloading";
		},

		clearProgress(modelId: string) {
			const row = rowsById.get(modelId);
			if (!row) { return; }
			row.querySelector(".progress")?.remove();
			row.querySelector(".progress-label")?.remove();
		},
	};
}
