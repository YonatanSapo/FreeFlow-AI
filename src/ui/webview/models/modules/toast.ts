/**
 * Toast notification module.
 * Uses ownerDocument.defaultView to avoid capturing a global `window`.
 */

export interface Toast {
	show(message: string, kind?: "info" | "error"): void;
}

export function createToast(el: HTMLElement): Toast {
	return {
		show(message: string, kind: "info" | "error" = "info") {
			el.textContent = message;
			el.dataset.kind = kind;
			el.classList.remove("hidden");
			const win = el.ownerDocument.defaultView;
			win?.setTimeout(() => el.classList.add("hidden"), 2_500);
		},
	};
}
