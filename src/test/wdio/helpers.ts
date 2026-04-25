/**
 * Shared helpers for wdio-vscode-service DOM E2E tests.
 *
 * Frame model inside VSCode:
 *   top frame
 *   └─ .webview iframe  (outer sandbox, injected by VS Code)
 *      └─ iframe#active-frame  (your HTML — the real webview content)
 *
 * WHY script-tag injection?
 * ChromeDriver executes browser.execute() in Chrome's "isolated world" —
 * a separate JS heap from the page's main world.  `window.dispatchEvent()`
 * called from the isolated world fires only listeners registered in THAT
 * world.  The webview scripts (models.ts, chat.ts) run in the main world,
 * so they never see isolated-world events.
 *
 * The fix: write data to a shared DOM attribute (DOM is shared between
 * worlds), then inject a <script> element (which executes in the main world)
 * to read the attribute and dispatch the real MessageEvent.
 */

/**
 * Ensure the FreeFlow-AI activity-bar item exists (extension is activated).
 * Callers should follow up with `openView(commandTitle)` to load the specific panel.
 */
export async function openFreeFlowAISidebar(): Promise<void> {
	const workbench = await browser.getWorkbench();
	const activityBar = workbench.getActivityBar();

	let viewControl = await activityBar.getViewControl("FreeFlow-AI");
	if (!viewControl) {
		await browser.waitUntil(
			async () => {
				viewControl = await activityBar.getViewControl("FreeFlow-AI");
				return viewControl !== null && viewControl !== undefined;
			},
			{
				timeout: 20_000,
				interval: 1_000,
				timeoutMsg: "FreeFlow-AI activity bar icon not found — is the extension loaded?",
			},
		);
	}

	await viewControl!.openView();
	await browser.pause(500);
}

/**
 * Open a FreeFlow-AI view by executing its named command through the
 * VS Code command palette.
 *
 * We use our own registered commands ("FreeFlow-AI: Open Chat" /
 * "FreeFlow-AI: Open Models") rather than the auto-generated
 * `{viewId}.focus` commands because:
 *  a) `workbench.executeCommand()` searches the palette by TITLE — our
 *     explicit titles are guaranteed to match.
 *  b) Our commands call both `workbench.view.extension.promptrouter` AND
 *     the view-specific `.focus` command, so the sidebar + the exact panel
 *     are both brought into view.
 *  c) This triggers `resolveWebviewView` (and thus sets webview.html and
 *     runs the init script) on first use.
 */
export async function openView(commandTitle: string): Promise<void> {
	const workbench = await browser.getWorkbench();
	await workbench.executeCommand(commandTitle);
	// Give VS Code time to call resolveWebviewView, parse HTML, and run the
	// init script so the data-*-ready attribute is set before enterWebview.
	await browser.pause(4_000);
}

/**
 * Switch the WebDriver frame context into the webview that contains
 * `staticSelector` (a DOM element present in the raw HTML, before any script
 * runs).  After entering the frame, waits for `readySelector` (a
 * `data-*-ready` attribute written by the init script) to confirm the webview
 * script has finished registering its listeners.
 *
 * Two-phase design:
 *  Phase 1 — iframe discovery: iterate over every outer VS Code sandbox iframe
 *             looking for the one whose active-frame contains `staticSelector`.
 *             This is purely structural — no script execution needed.
 *  Phase 2 — script ready: once inside the correct frame, wait for the init
 *             script to set the `data-*-ready` attribute.
 */
export async function enterWebview(
	staticSelector: string,
	readySelector?: string,
	timeout = 40_000,
): Promise<void> {
	// Phase 1 — find the correct iframe.
	await browser.waitUntil(
		async () => {
			await browser.switchToFrame(null);

			const frameCount: number = await browser.execute(
				() => document.querySelectorAll("iframe").length,
			);

			for (let i = 0; i < frameCount; i++) {
				await browser.switchToFrame(null);
				const frames = await browser.$$("iframe");
				if (i >= frames.length) { break; }

				try {
					await browser.switchToFrame(frames[i]); // outer sandbox

					const innerFrame = await browser.$("iframe#active-frame");
					if (await innerFrame.isExisting()) {
						await browser.switchToFrame(innerFrame); // inner content
						if (await browser.$(staticSelector).isExisting()) {
							return true; // ✓ found — stay inside
						}
					} else if (await browser.$(staticSelector).isExisting()) {
						return true; // flat layout
					}
				} catch {
					// Frame detached / still loading — try next
				}
			}
			return false;
		},
		{
			timeout,
			interval: 1_500,
			timeoutMsg: `Could not find webview containing "${staticSelector}" within ${timeout} ms`,
		},
	);

	// Phase 2 — wait for init script to finish (optional but expected).
	if (readySelector) {
		await browser.waitUntil(
			async () => browser.$(readySelector).isExisting(),
			{
				timeout: 15_000,
				interval: 300,
				timeoutMsg: `Webview script never set "${readySelector}" within 15 s`,
			},
		);
	}
}

/**
 * Inject a message into the webview's event bus.
 *
 * Uses `window.postMessage` — which goes through the browser's cross-frame
 * messaging channel, NOT JavaScript's isolated-world event dispatch.
 * This means that `window.addEventListener('message', ...)` handlers
 * registered in the webview's MAIN WORLD will receive the event even though
 * this function runs in ChromeDriver's ISOLATED world.
 *
 * An earlier script-tag injection approach was tried but the VS Code webview
 * CSP (`script-src 'nonce-...'`) blocks inline scripts without the page nonce,
 * making that approach unreliable.
 */
export async function injectMessage(data: Record<string, unknown>): Promise<void> {
	await browser.execute((json: string) => {
		window.postMessage(JSON.parse(json), "*");
	}, JSON.stringify(data));
	// Brief yield so the browser can dispatch the message event before the
	// caller queries the DOM.
	await browser.pause(50);
}

/**
 * Dispatch a synthetic KeyboardEvent on a DOM element.
 *
 * Unlike `browser.action("key")`, this goes directly through the DOM event
 * system rather than the OS input pipeline.  DOM events are shared between
 * ChromeDriver's isolated world and the page's main world, so listeners
 * registered by webview scripts (running in the main world) WILL fire.
 *
 * Note: synthetic (untrusted) events do NOT trigger the browser's own default
 * actions (e.g., inserting characters into a textarea), but they DO trigger
 * JavaScript `keydown` listeners — which is exactly what the composer module
 * listens for.
 */
export async function pressKey(
	selector: string,
	key: string,
	modifiers: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean } = {},
): Promise<void> {
	await browser.execute(
		(sel: string, k: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean }) => {
			const el = document.querySelector(sel);
			if (!el) { return; }
			el.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: k,
					code: k === "Enter" ? "Enter" : k,
					bubbles: true,
					cancelable: true,
					ctrlKey: !!mods.ctrlKey,
					shiftKey: !!mods.shiftKey,
					metaKey: !!mods.metaKey,
				}),
			);
		},
		selector,
		key,
		modifiers,
	);
	await browser.pause(50);
}

/** Restore WebDriver context to the top-level VS Code frame. */
export async function exitWebview(): Promise<void> {
	try {
		await browser.switchToFrame(null);
	} catch {
		// Session / window may already be gone after a failing spec — ignore.
	}
}

/**
 * Return true when Ollama is reachable at the default local address.
 */
export async function isOllamaReachable(): Promise<boolean> {
	try {
		const res = await fetch("http://127.0.0.1:11434/api/tags", {
			signal: AbortSignal.timeout(3_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}
