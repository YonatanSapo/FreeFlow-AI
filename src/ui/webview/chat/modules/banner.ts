/**
 * Offline / warning banner module.
 */

export interface Banner {
	show(text: string): void;
	hide(): void;
}

export function createBanner(
	container: HTMLElement,
	textEl: HTMLElement,
	retryBtn: HTMLButtonElement,
	onRetry: () => void,
): Banner {
	retryBtn.addEventListener("click", () => onRetry());

	return {
		show(text: string) {
			textEl.textContent = text;
			container.classList.remove("hidden");
		},
		hide() {
			container.classList.add("hidden");
		},
	};
}
