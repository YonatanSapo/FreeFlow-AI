/**
 * Composer module: textarea + Send / Stop buttons + keyboard shortcuts.
 *
 * Keyboard rules:
 *  - Enter, Ctrl+Enter, or Cmd+Enter (⌘) → send
 *  - Shift+Enter → insert newline (default browser behaviour)
 */

export interface Composer {
	/** Toggle the in-flight (generating) state. */
	setInFlight(on: boolean): void;
}

export function createComposer(
	textarea: HTMLTextAreaElement,
	sendBtn: HTMLButtonElement,
	cancelBtn: HTMLButtonElement,
	typingIndicator: HTMLElement,
	onSend: (text: string) => void,
	onCancel: () => void,
): Composer {
	function autoSize(): void {
		textarea.style.height = "0px";
		const maxPx = 9.5 * 16;
		textarea.style.height = `${Math.max(Math.min(textarea.scrollHeight, maxPx), 40)}px`;
	}

	function trySend(): void {
		const text = textarea.value.trim();
		if (!text) { return; }
		onSend(text);
		textarea.value = "";
		autoSize();
	}

	sendBtn.addEventListener("click", () => trySend());
	cancelBtn.addEventListener("click", () => onCancel());
	textarea.addEventListener("input", () => autoSize());

	textarea.addEventListener("keydown", (e: KeyboardEvent) => {
		const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
		if (!isEnter || e.shiftKey) { return; }
		e.preventDefault();
		trySend();
	});

	autoSize();

	return {
		setInFlight(on: boolean) {
			sendBtn.disabled = on;
			textarea.disabled = on;
			cancelBtn.classList.toggle("hidden", !on);
			typingIndicator.classList.toggle("hidden", !on);
		},
	};
}
