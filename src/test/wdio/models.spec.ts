/**
 * Models Panel — DOM E2E tests
 *
 * Drives a real VS Code instance via ChromeDriver (wdio-vscode-service).
 * Each message from the extension host is simulated via `injectMessage`,
 * which uses a script-tag / DOM-attribute bridge to run code in the
 * webview's main world rather than ChromeDriver's isolated world.
 *
 * Covered scenarios:
 *  - Ollama is up   (dot green, status "Running")
 *  - Ollama is down (dot red, instructions shown)
 *  - List models    (2 models rendered, correct buttons)
 *  - Install flow   (click Install → progress bar → done toast → list update)
 *  - Install specific model by tag
 *  - Remove flow    (click Remove → updated list)
 *  - List models after installing
 *  - Refresh button: Ollama down scenario
 *  - Refresh button: Ollama up scenario
 *  - pullError      (error toast, no progress bar)
 *  - toast messages (info / error)
 */

import {
	openPromptRouterSidebar,
	openView,
	enterWebview,
	exitWebview,
	isOllamaReachable,
	injectMessage,
} from "./helpers";

// Wait for the webview SCRIPT to finish registering all listeners.
const MODELS_ANCHOR = "html[data-models-ready]";

// ---------------------------------------------------------------------------
// Fixture data (matches ModelInfo / ExtToModels message shapes)
// ---------------------------------------------------------------------------
// Tags must NOT match real models used by `npm test` (e.g. qwen2.5:0.5b) — clicking
// Install/Remove dispatches real Ollama API calls from the extension host.
const MODEL_A = {
	id: "ollama:promptrouter-wdio-a:1",
	tag: "promptrouter-wdio-a:1",
	displayName: "promptrouter-wdio-a:1",
	status: "installed" as const,
};
const MODEL_B = {
	id: "ollama:promptrouter-wdio-b:1",
	tag: "promptrouter-wdio-b:1",
	displayName: "promptrouter-wdio-b:1",
	status: "not-installed" as const,
};
const MODEL_B_INSTALLED = { ...MODEL_B, status: "installed" as const };

const msgModelsUp = {
	type: "models",
	list: [MODEL_A, MODEL_B],
	running: [],
	health: { reachable: true, platform: "darwin" },
};

const msgModelsDown = {
	type: "models",
	list: [],
	running: [],
	health: { reachable: false, platform: "darwin" },
};

// ---------------------------------------------------------------------------

describe("Models Panel — DOM E2E", function () {
	before(async function () {
		const reachable = await isOllamaReachable();
		if (!reachable) {
			console.warn("[wdio:models] Ollama not reachable — skipping suite");
			this.skip();
		}
		await openPromptRouterSidebar();
		// Use our explicit command to ensure VS Code calls resolveWebviewView
		// for the Models panel before we try to enter the iframe.
		await openView("PromptRouter: Open Models");
		// Phase 1: find the iframe by a static HTML element.
		// Phase 2: wait for models.ts init script to finish (MODELS_ANCHOR).
		await enterWebview("#ollamaDot", MODELS_ANCHOR);

		// Wait for the extension's initial pushModels() to complete.
		// Once the dot leaves 'initializing' the extension will not push again
		// unless a refresh/install/remove is triggered — so our injectMessage
		// calls in individual tests will be stable.
		await browser.waitUntil(
			async () => {
				const cls = (await (await $("#ollamaDot")).getAttribute("class")) ?? "";
				return cls.includes("running") || cls.includes("not-installed");
			},
			{ timeout: 10_000, interval: 300, timeoutMsg: "Extension never finished initial pushModels()" },
		);
	});

	after(async () => {
		await exitWebview();
	});

	// =========================================================================
	// Static structure
	// =========================================================================

	it("renders the 'Manage Models' heading", async () => {
		const heading = await $("h2");
		await expect(heading).toBeExisting();
		await expect(heading).toHaveText("Manage Models");
	});

	it("renders a Refresh button", async () => {
		const btn = await $("#refreshBtn");
		await expect(btn).toBeExisting();
		await expect(btn).toHaveText("Refresh");
	});

	it("renders the Ollama status span", async () => {
		await expect(await $("#ollamaStatus")).toBeExisting();
	});

	it("Ollama dot exists on first open", async () => {
		await expect(await $("#ollamaDot")).toBeExisting();
	});

	// =========================================================================
	// Ollama is UP
	// =========================================================================

	it("Ollama up: dot turns green and status reads 'Running'", async () => {
		await injectMessage(msgModelsUp);
		const dot = await $("#ollamaDot");
		await browser.waitUntil(
			async () => (await dot.getAttribute("class")).includes("running"),
			{ timeout: 5_000, interval: 200, timeoutMsg: "dot never turned green after reachable:true" },
		);
		await expect(await $("#ollamaStatus")).toHaveText("Running");
	});

	it("Ollama up: install instructions are hidden", async () => {
		const instructions = await $("#ollamaInstructions");
		expect(await instructions.getAttribute("class")).toContain("hidden");
	});

	// =========================================================================
	// Model list
	// =========================================================================

	it("list shows correct number of models", async () => {
		const rows = await $$("#localList li");
		expect(rows.length).toBe(2);
	});

	it("installed model row shows a Remove button", async () => {
		const rows = await $$("#localList li");
		const btn = await rows[0].$("button");
		await expect(btn).toBeExisting();
		await expect(btn).toHaveText("Remove");
	});

	it("not-installed model row shows an Install button", async () => {
		const rows = await $$("#localList li");
		const btn = await rows[1].$("button");
		await expect(btn).toBeExisting();
		await expect(btn).toHaveText("Install");
	});

	it("model display names are visible in the list", async () => {
		const names = await $$("#localList .name");
		const texts: string[] = [];
		for (const n of names) {
			texts.push(await n.getText());
		}
		expect(texts).toContain(MODEL_A.displayName);
		expect(texts).toContain(MODEL_B.displayName);
	});

	// =========================================================================
	// Ollama is DOWN
	// =========================================================================

	it("Ollama down: dot turns red and status reads 'Not running'", async () => {
		await injectMessage(msgModelsDown);
		const dot = await $("#ollamaDot");
		await browser.waitUntil(
			async () => (await dot.getAttribute("class")).includes("not-installed"),
			{ timeout: 5_000, interval: 200, timeoutMsg: "dot never turned red after reachable:false" },
		);
		const statusText = await (await $("#ollamaStatus")).getText();
		expect(statusText).toContain("Not running");
	});

	it("Ollama down: install instructions appear", async () => {
		const instructions = await $("#ollamaInstructions");
		await browser.waitUntil(
			async () => !(await instructions.getAttribute("class")).includes("hidden"),
			{ timeout: 3_000, interval: 100, timeoutMsg: "instructions section never appeared" },
		);
		const text = await instructions.getText();
		expect(text.length).toBeGreaterThan(10);
	});

	it("Ollama down: instructions contain an install command", async () => {
		const instructions = await $("#ollamaInstructions");
		const text = await instructions.getText();
		// On darwin the brew or download instructions should be present
		expect(text.toLowerCase()).toMatch(/ollama|brew|download/);
	});

	// =========================================================================
	// Install flow for a specific model (UI simulation)
	// =========================================================================

	it("install specific model: Install button click triggers pullProgress bar", async () => {
		// Start from a known state: MODEL_B not installed
		await injectMessage(msgModelsUp);
		await browser.waitUntil(async () => (await $$("#localList li")).length === 2, { timeout: 3_000 });

		const rows = await $$("#localList li");
		const installBtn = await rows[1].$("button");
		await expect(installBtn).toHaveText("Install");
		await installBtn.click();

		// Simulate the extension host sending pull progress for MODEL_B
		await injectMessage({
			type: "pullProgress",
			modelId: MODEL_B.id,
			status: "downloading",
			completed: 40_000_000,
			total: 100_000_000,
		});

		const freshRows = await $$("#localList li");
		const bar = await freshRows[1].$(".progress-bar");
		await expect(bar).toBeExisting();
		const width = await bar.getCSSProperty("width");
		expect(parseFloat(width.value as string)).toBeGreaterThan(0);
	});

	it("install flow: pullDone clears progress bar and shows success toast", async () => {
		await injectMessage({ type: "pullDone", modelId: MODEL_B.id });

		const rows = await $$("#localList li");
		const bar = await rows[1].$(".progress-bar");
		await expect(bar).not.toBeExisting();

		const toast = await $("#toast");
		await browser.waitUntil(
			async () => !(await toast.getAttribute("class")).includes("hidden"),
			{ timeout: 3_000, interval: 100, timeoutMsg: "success toast never appeared after pullDone" },
		);
	});

	it("list updates after installing: model now shows Remove button", async () => {
		// Extension would push a fresh models list after install completes
		await injectMessage({
			type: "models",
			list: [MODEL_A, MODEL_B_INSTALLED],
			running: [],
			health: { reachable: true, platform: "darwin" },
		});

		const rows = await $$("#localList li");
		expect(rows.length).toBe(2);
		const btn = await rows[1].$("button");
		await expect(btn).toHaveText("Remove");
	});

	// =========================================================================
	// Remove flow
	// =========================================================================

	it("remove model: Remove button click is present and enabled", async () => {
		// Both models installed for this test
		await injectMessage({
			type: "models",
			list: [MODEL_A, MODEL_B_INSTALLED],
			running: [],
			health: { reachable: true, platform: "darwin" },
		});
		await browser.waitUntil(async () => (await $$("#localList li")).length === 2, { timeout: 3_000 });

		const rows = await $$("#localList li");
		const removeBtn = await rows[0].$("button");
		await expect(removeBtn).toHaveText("Remove");
		await expect(removeBtn).toBeEnabled();
		await removeBtn.click(); // fires the vscodeApi.postMessage({type:"remove",...})
	});

	it("list updates after removal: model shows Install button", async () => {
		// Extension pushes updated list after removing MODEL_A
		const MODEL_A_REMOVED = { ...MODEL_A, status: "not-installed" as const };
		await injectMessage({
			type: "models",
			list: [MODEL_A_REMOVED, MODEL_B_INSTALLED],
			running: [],
			health: { reachable: true, platform: "darwin" },
		});
		await browser.waitUntil(async () => {
			const rows = await $$("#localList li");
			const btn = await rows[0].$("button");
			return (await btn.getText()) === "Install";
		}, { timeout: 3_000, interval: 100, timeoutMsg: "Remove→Install transition never happened" });
	});

	// =========================================================================
	// Refresh button: Ollama down and up scenarios
	// =========================================================================

	it("refresh btn (Ollama down): inject refreshing:true → button disabled and text changes", async () => {
		await injectMessage(msgModelsDown);
		await injectMessage({ type: "refreshing", on: true });

		const btn = await $("#refreshBtn");
		await browser.waitUntil(
			async () => (await btn.getText()).includes("Refreshing"),
			{ timeout: 3_000, interval: 100, timeoutMsg: "button never showed 'Refreshing…'" },
		);
		await expect(btn).toBeDisabled();
	});

	it("refresh btn (Ollama up): inject refreshing:false + healthy models → button re-enabled", async () => {
		await injectMessage({ type: "refreshing", on: false });
		await injectMessage(msgModelsUp);

		const btn = await $("#refreshBtn");
		await browser.waitUntil(
			async () => (await btn.getText()) === "Refresh",
			{ timeout: 3_000, interval: 100, timeoutMsg: "button never returned to 'Refresh'" },
		);
		await expect(btn).toBeEnabled();

		// Dot should still be green (refreshing cycle must not reset dot to initializing)
		const dot = await $("#ollamaDot");
		expect(await dot.getAttribute("class")).toContain("running");
	});

	// =========================================================================
	// pullError
	// =========================================================================

	it("pullError: clears progress bar and shows an error toast", async () => {
		await injectMessage(msgModelsUp);
		await browser.waitUntil(async () => (await $$("#localList li")).length === 2, { timeout: 3_000 });

		// Start a fake pull then immediately error
		await injectMessage({
			type: "pullProgress",
			modelId: MODEL_B.id,
			status: "downloading",
			completed: 10_000_000,
			total: 100_000_000,
		});
		await injectMessage({
			type: "pullError",
			modelId: MODEL_B.id,
			message: "connection reset",
		});

		// Check the toast FIRST — it auto-hides after 2.5 s so we must not
		// spend that time verifying the progress bar first.
		await browser.waitUntil(
			async () => {
				const t = await $("#toast");
				if (!(await t.isExisting())) { return false; }
				return !(await t.getAttribute("class")).includes("hidden");
			},
			{ timeout: 3_000, interval: 100, timeoutMsg: "error toast never appeared after pullError" },
		);
		expect(await (await $("#toast")).getAttribute("data-kind")).toBe("error");

		// Progress bar should be gone too
		const rows = await $$("#localList li");
		const bar = await rows[1].$(".progress-bar");
		await expect(bar).not.toBeExisting();
	});

	// =========================================================================
	// Toast messages
	// =========================================================================

	it("info message type shows an info toast", async () => {
		await injectMessage({ type: "info", message: "Operation complete" });
		await browser.waitUntil(
			async () => {
				const t = await $("#toast");
				if (!(await t.isExisting())) { return false; }
				return !(await t.getAttribute("class")).includes("hidden");
			},
			{ timeout: 3_000, interval: 100, timeoutMsg: "info toast never appeared" },
		);
		await expect(await $("#toast")).toHaveText("Operation complete");
	});

	it("error message type shows an error toast", async () => {
		await injectMessage({ type: "error", message: "Something went wrong" });
		await browser.waitUntil(
			async () => {
				const t = await $("#toast");
				if (!(await t.isExisting())) { return false; }
				return !(await t.getAttribute("class")).includes("hidden");
			},
			{ timeout: 3_000, interval: 100, timeoutMsg: "error toast never appeared" },
		);
		expect(await (await $("#toast")).getAttribute("data-kind")).toBe("error");
		await expect(await $("#toast")).toHaveText("Something went wrong");
	});
});
