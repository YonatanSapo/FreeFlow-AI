/**
 * Status indicator module: Ollama daemon dot + label + install instructions.
 * Accepts DOM elements so it is testable in JSDOM without global `document`.
 */

export interface StatusIndicator {
	setInitializing(): void;
	setRunning(): void;
	setDown(platform: string, error?: string): void;
}

export function createStatusIndicator(
	dot: HTMLSpanElement,
	label: HTMLSpanElement,
	instructions: HTMLElement,
): StatusIndicator {
	const doc = dot.ownerDocument;

	function makeEl(tag: string, className?: string): HTMLElement {
		const el = doc.createElement(tag) as HTMLElement;
		if (className) { el.className = className; }
		return el;
	}

	function makeCopyBtn(text: string): HTMLButtonElement {
		const btn = doc.createElement("button") as HTMLButtonElement;
		btn.textContent = "Copy";
		btn.className = "copy-btn";
		btn.title = `Copy: ${text}`;
		btn.addEventListener("click", () => {
			const win = doc.defaultView;
			void win?.navigator?.clipboard?.writeText(text);
		});
		return btn;
	}

	function makeInstRow(lbl: string, cmd: string): HTMLElement {
		const row = makeEl("div", "inst-row");
		const lblEl = makeEl("span", "inst-label");
		lblEl.textContent = lbl;
		const code = doc.createElement("code");
		code.textContent = cmd;
		row.appendChild(lblEl);
		row.appendChild(code);
		row.appendChild(makeCopyBtn(cmd));
		return row;
	}

	function makeOr(text: string): HTMLElement {
		const d = makeEl("div", "inst-or");
		d.textContent = text;
		return d;
	}

	function makeHeading(text: string): HTMLElement {
		const d = makeEl("div", "inst-heading");
		d.textContent = text;
		return d;
	}

	function buildInstructions(platform: string): DocumentFragment {
		const frag = doc.createDocumentFragment();
		const isMac = platform === "darwin";
		const isWin = platform === "win32";

		frag.appendChild(makeHeading("Install Ollama"));
		if (isMac) {
			frag.appendChild(makeInstRow("Homebrew:", "brew install ollama"));
			frag.appendChild(makeOr("— or — download from https://ollama.com/download/mac"));
		} else if (isWin) {
			frag.appendChild(makeInstRow("winget:", "winget install Ollama.Ollama"));
			frag.appendChild(makeOr("— or — download from https://ollama.com/download/windows"));
		} else {
			frag.appendChild(makeInstRow("Linux:", "curl -fsSL https://ollama.com/install.sh | sh"));
			frag.appendChild(makeOr("— or — https://ollama.com/download"));
		}

		frag.appendChild(makeHeading("Start the daemon"));
		frag.appendChild(makeInstRow("Terminal:", "ollama serve"));
		if (isMac) {
			frag.appendChild(makeOr("— or — launch Ollama.app from your Applications folder"));
		} else if (isWin) {
			frag.appendChild(makeOr("— or — start Ollama from the Start Menu"));
		}

		return frag;
	}

	return {
		setInitializing() {
			dot.className = "dot initializing";
			dot.title = "Checking Ollama…";
			label.textContent = "Checking…";
			instructions.innerHTML = "";
			instructions.classList.add("hidden");
		},

		setRunning() {
			dot.className = "dot running";
			dot.title = "Ollama is running";
			label.textContent = "Running";
			instructions.innerHTML = "";
			instructions.classList.add("hidden");
		},

		setDown(platform: string, error?: string) {
			dot.className = "dot not-installed";
			dot.title = "Ollama is not running";
			label.textContent = error ? `Not running — ${error}` : "Not running";
			instructions.innerHTML = "";
			instructions.appendChild(buildInstructions(platform));
			instructions.classList.remove("hidden");
		},
	};
}
