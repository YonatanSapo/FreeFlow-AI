/**
 * Message list module: user / assistant / error bubbles + streaming chunks.
 *
 * `renderMd` is injected so this module has no dependency on marked or
 * DOMPurify — making it independently testable with any renderer.
 */

export type MarkdownRenderer = (raw: string) => string;

export interface MessageList {
	appendUser(text: string): void;
	/** Returns the inner `.msg-body` element to stream chunks into. */
	appendAssistantShell(promptId: string): HTMLElement;
	/** Appends a streaming chunk; returns updated accumulated markdown. */
	appendChunk(bodyEl: HTMLElement, delta: string, accMd: string): string;
	/** Mark an existing assistant bubble (by bodyEl) or append a standalone error. */
	appendError(text: string, bodyEl?: HTMLElement): void;
}

export function createMessageList(
	container: HTMLElement,
	renderMd: MarkdownRenderer,
): MessageList {
	const doc = container.ownerDocument;

	function scrollToBottom(): void {
		container.scrollTop = container.scrollHeight;
	}

	function attachCodeCopyButtons(root: HTMLElement): void {
		for (const pre of Array.from(root.querySelectorAll("pre"))) {
			if (pre.querySelector(":scope > .code-copy")) { continue; }
			const btn = doc.createElement("button") as HTMLButtonElement;
			btn.type = "button";
			btn.className = "code-copy";
			btn.textContent = "Copy";
			btn.addEventListener("click", () => {
				const code = pre.querySelector("code");
				const text = code?.textContent ?? pre.textContent ?? "";
				const win = doc.defaultView;
				void win?.navigator?.clipboard?.writeText(text).then(
					() => {
						btn.textContent = "Copied!";
						win?.setTimeout(() => { btn.textContent = "Copy"; }, 1_600);
					},
					() => {
						btn.textContent = "Failed";
						win?.setTimeout(() => { btn.textContent = "Copy"; }, 1_600);
					},
				);
			});
			pre.appendChild(btn);
		}
	}

	return {
		appendUser(text: string) {
			const wrap = doc.createElement("div");
			wrap.className = "msg user";
			const body = doc.createElement("div");
			body.className = "msg-body";
			body.textContent = text;
			wrap.appendChild(body);
			container.appendChild(wrap);
			scrollToBottom();
		},

		appendAssistantShell(promptId: string): HTMLElement {
			const wrap = doc.createElement("div");
			wrap.className = "msg assistant";
			wrap.dataset.promptId = promptId;
			const body = doc.createElement("div");
			body.className = "msg-body";
			wrap.appendChild(body);
			container.appendChild(wrap);
			scrollToBottom();
			return body;
		},

		appendChunk(bodyEl: HTMLElement, delta: string, accMd: string): string {
			const newMd = accMd + delta;
			bodyEl.innerHTML = renderMd(newMd);
			attachCodeCopyButtons(bodyEl);
			scrollToBottom();
			return newMd;
		},

		appendError(text: string, bodyEl?: HTMLElement) {
			if (bodyEl) {
				const wrap = bodyEl.parentElement;
				wrap?.classList.add("error");
				bodyEl.textContent = text;
			} else {
				const wrap = doc.createElement("div");
				wrap.className = "msg error";
				const body = doc.createElement("div");
				body.className = "msg-body";
				body.textContent = text;
				wrap.appendChild(body);
				container.appendChild(wrap);
			}
			scrollToBottom();
		},
	};
}
