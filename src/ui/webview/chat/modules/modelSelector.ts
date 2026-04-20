/**
 * Model selector dropdown module.
 * Renders ModelInfo items into a <select> and tracks selection.
 */

import type { ModelInfo } from "../../shared/messages";

export interface ModelSelector {
	render(models: ModelInfo[]): void;
	getSelectedId(): string;
}

function statusDot(status: ModelInfo["status"]): string {
	switch (status) {
		case "installed":     return "●";
		case "not-installed": return "○";
		case "unavailable":   return "·";
	}
}

export function createModelSelector(select: HTMLSelectElement): ModelSelector {
	const doc = select.ownerDocument;

	return {
		render(models: ModelInfo[]) {
			const current = select.value;
			select.innerHTML = "";

			for (const m of models) {
				const opt = doc.createElement("option") as HTMLOptionElement;
				opt.value = m.id;
				opt.textContent = `${m.displayName} ${statusDot(m.status)}`;
				opt.disabled = m.status !== "installed";
				select.appendChild(opt);
			}

			if (current && models.some((m) => m.id === current)) {
				select.value = current;
			} else {
				const first = models.find((m) => m.status === "installed");
				if (first) { select.value = first.id; }
			}
		},

		getSelectedId(): string {
			return select.value;
		},
	};
}
