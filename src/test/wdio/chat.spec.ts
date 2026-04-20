/**
 * Chat Panel — DOM E2E tests
 *
 * Drives a real VS Code instance via ChromeDriver (wdio-vscode-service).
 * All keyboard/click interactions use real browser events.
 * Extension responses (models, chunk, done, error) are injected via
 * `injectMessage`, which runs in the webview's main world via a
 * script-tag / DOM-attribute bridge — not the ChromeDriver isolated world.
 *
 * Covered scenarios:
 *  - Static structure (textarea placeholder, buttons, typing indicator)
 *  - New prompt (typing, value updates)
 *  - Send prompt with Enter
 *  - Send prompt with Ctrl+Enter
 *  - Shift+Enter inserts a newline (does NOT send)
 *  - Send a long prompt (200+ chars)
 *  - Offline banner (Ollama down / up)
 *  - Select a model out of 2 installed models and send a prompt
 *  - Streaming response (chunk → text appears, done → state clears)
 *  - Error response (error bubble)
 *  - Cancel flow
 */

import {
	openPromptRouterSidebar,
	openView,
	enterWebview,
	exitWebview,
	isOllamaReachable,
	injectMessage,
	pressKey,
} from "./helpers";

// Wait for the webview SCRIPT to finish registering all listeners.
const CHAT_ANCHOR = "html[data-chat-ready]";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------
const MODEL_A = {
	id: "ollama:qwen2.5:0.5b",
	tag: "qwen2.5:0.5b",
	displayName: "qwen2.5:0.5b",
	status: "installed" as const,
};
const MODEL_B = {
	id: "ollama:llama3.2:1b",
	tag: "llama3.2:1b",
	displayName: "llama3.2:1b",
	status: "installed" as const,
};
const MODEL_NOT_INSTALLED = {
	id: "ollama:mistral:7b",
	tag: "mistral:7b",
	displayName: "mistral:7b",
	status: "not-installed" as const,
};

async function injectModels(
	models: typeof MODEL_A[],
	reachable = true,
): Promise<void> {
	await injectMessage({
		type: "models",
		list: models,
		health: { reachable, platform: "darwin" },
	});
}

// ---------------------------------------------------------------------------

describe("Chat Panel — DOM E2E", function () {
	before(async function () {
		const reachable = await isOllamaReachable();
		if (!reachable) {
			console.warn("[wdio:chat] Ollama not reachable — skipping suite");
			this.skip();
		}
		await openPromptRouterSidebar();
		// Use our explicit command to ensure VS Code calls resolveWebviewView
		// for the Chat panel before we try to enter the iframe.
		await openView("PromptRouter: Open Chat");
		// Phase 1: find the iframe by a static HTML element.
		// Phase 2: wait for chat.ts init script to finish (CHAT_ANCHOR).
		await enterWebview("#input", CHAT_ANCHOR);

		// Wait for the extension's initial pushModels() to settle so it won't
		// overwrite our test injections.
		const select = await $("#modelSelect");
		await browser.waitUntil(
			async () => (await select.$$("option")).length > 0,
			{ timeout: 10_000, interval: 300, timeoutMsg: "Extension never finished initial pushModels()" },
		);

		// Seed with a known single installed model so subsequent tests start
		// from a controlled state.
		await injectModels([MODEL_A]);
		await browser.waitUntil(
			async () => (await select.$$("option")).length === 1,
			{ timeout: 5_000, interval: 200, timeoutMsg: "model selector never reduced to 1 option" },
		);
	});

	after(async () => {
		await exitWebview();
	});

	// =========================================================================
	// Static structure
	// =========================================================================

	it("renders textarea with placeholder 'sapoz'", async () => {
		const textarea = await $("#input");
		await expect(textarea).toBeExisting();
		expect(await textarea.getAttribute("placeholder")).toBe("sapoz");
	});

	it("renders the Send button enabled", async () => {
		const btn = await $("#sendBtn");
		await expect(btn).toBeExisting();
		await expect(btn).toHaveText("Send");
		await expect(btn).toBeEnabled();
	});

	it("renders the Cancel button hidden by default", async () => {
		const btn = await $("#cancelBtn");
		await expect(btn).toBeExisting();
		expect(await btn.getAttribute("class")).toContain("hidden");
	});

	it("typing indicator is hidden initially", async () => {
		const indicator = await $("#typingIndicator");
		await expect(indicator).toBeExisting();
		expect(await indicator.getAttribute("class")).toContain("hidden");
	});

	// =========================================================================
	// Model selector
	// =========================================================================

	it("model selector shows the injected installed model", async () => {
		const select = await $("#modelSelect");
		const opts = await select.$$("option");
		expect(opts.length).toBeGreaterThanOrEqual(1);
		const firstOpt = await opts[0].getAttribute("disabled");
		expect(firstOpt).toBeNull(); // installed → not disabled
	});

	it("not-installed models appear as disabled options", async () => {
		await injectModels([MODEL_A, MODEL_NOT_INSTALLED]);
		const select = await $("#modelSelect");
		await browser.waitUntil(
			async () => (await select.$$("option")).length >= 2,
			{ timeout: 3_000 },
		);
		const opts = await select.$$("option");
		const disabledAttr = await opts[1].getAttribute("disabled");
		expect(disabledAttr).not.toBeNull();
		// Restore
		await injectModels([MODEL_A]);
	});

	it("can select a model from 2 installed options", async () => {
		await injectModels([MODEL_A, MODEL_B]);
		const select = await $("#modelSelect");
		await browser.waitUntil(async () => (await select.$$("option")).length >= 2, { timeout: 3_000 });

		const opts = await select.$$("option");
		const secondValue = await opts[1].getValue();
		await select.selectByAttribute("value", secondValue);
		expect(await select.getValue()).toBe(secondValue);

		// Restore to single model for subsequent tests
		await injectModels([MODEL_A]);
		await browser.waitUntil(async () => (await select.$$("option")).length === 1, { timeout: 3_000 });
	});

	// =========================================================================
	// Offline banner
	// =========================================================================

	it("offline banner appears when Ollama is down", async () => {
		await injectModels([], false);
		const banner = await $("#banner");
		await browser.waitUntil(
			async () => !(await banner.getAttribute("class")).includes("hidden"),
			{ timeout: 3_000, interval: 100, timeoutMsg: "offline banner never appeared" },
		);
	});

	it("offline banner disappears when Ollama comes back up", async () => {
		await injectModels([MODEL_A]);
		const banner = await $("#banner");
		await browser.waitUntil(
			async () => (await banner.getAttribute("class")).includes("hidden"),
			{ timeout: 3_000, interval: 100, timeoutMsg: "offline banner never hid" },
		);
	});

	// =========================================================================
	// New prompt — typing
	// =========================================================================

	it("textarea starts empty (new prompt ready to type)", async () => {
		const input = await $("#input");
		const val = await input.getValue();
		expect(val.trim()).toBe("");
	});

	it("typing in the textarea updates its value", async () => {
		const input = await $("#input");
		await input.setValue("Hello test");
		expect(await input.getValue()).toBe("Hello test");
		await input.setValue("");
	});

	// =========================================================================
	// Sending a prompt — Enter key + in-flight state
	// =========================================================================

	it("pressing Enter creates a user bubble and enters in-flight state", async () => {
		// One synchronous main-world turn: dispatch keydown, then read DOM.
		// Polling with WebdriverIO can miss the in-flight window when Ollama answers
		// within a few milliseconds of `postMessage`.
		const snapshot = await browser.execute(() => {
			const input = document.querySelector("#input") as HTMLTextAreaElement;
			const before = document.querySelectorAll(".msg.user").length;
			input.value = "Ping from Enter key test";
			input.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }),
			);
			const after = document.querySelectorAll(".msg.user").length;
			const send = document.querySelector("#sendBtn") as HTMLButtonElement;
			const cancel = document.querySelector("#cancelBtn") as HTMLElement;
			const typing = document.querySelector("#typingIndicator") as HTMLElement;
			const userBodies = document.querySelectorAll(".msg.user .msg-body");
			const lastUser = userBodies[userBodies.length - 1];
			return {
				userDelta: after - before,
				sendDisabled: send.disabled,
				cancelHidden: cancel.classList.contains("hidden"),
				typingHidden: typing.classList.contains("hidden"),
				lastUserText: lastUser?.textContent ?? "",
			};
		});

		expect(snapshot.userDelta).toBe(1);
		expect(snapshot.lastUserText).toBe("Ping from Enter key test");
		expect(snapshot.sendDisabled).toBe(true);
		expect(snapshot.cancelHidden).toBe(false);
		expect(snapshot.typingHidden).toBe(false);
	});

	// Wait for Ollama to respond naturally — no artificial done injection.
	it("in-flight state clears after Ollama responds", async () => {
		const sendBtn = await $("#sendBtn");
		await browser.waitUntil(
			async () => await sendBtn.isEnabled(),
			{ timeout: 15_000, interval: 200, timeoutMsg: "Send button never re-enabled after Ollama response" },
		);
		expect(await (await $("#cancelBtn")).getAttribute("class")).toContain("hidden");
		expect(await (await $("#typingIndicator")).getAttribute("class")).toContain("hidden");
	});

	// =========================================================================
	// Sending a prompt — Ctrl+Enter
	// =========================================================================

	it("Ctrl+Enter sends the prompt (user bubble appears)", async () => {
		const input = await $("#input");
		const messages = await $("#messages");
		const countBefore = (await messages.$$(".msg.user")).length;

		await input.setValue("Ping from Ctrl+Enter test");
		await pressKey("#input", "Enter", { ctrlKey: true });

		await browser.waitUntil(
			async () => (await messages.$$(".msg.user")).length > countBefore,
			{ timeout: 5_000, interval: 100, timeoutMsg: "user bubble never appeared after Ctrl+Enter" },
		);

		// Wait for Ollama to finish before next test
		await browser.waitUntil(async () => await (await $("#sendBtn")).isEnabled(), { timeout: 15_000, interval: 200 });
	});

	// =========================================================================
	// Shift+Enter does NOT send
	// =========================================================================

	it("Shift+Enter does not send a message", async () => {
		const input = await $("#input");
		const messages = await $("#messages");
		const countBefore = (await messages.$$(".msg.user")).length;

		// Synthetic Shift+Enter → composer listener returns early (shiftKey guard)
		await input.setValue("Line one");
		await pressKey("#input", "Enter", { shiftKey: true });

		// No new user bubble
		expect((await messages.$$(".msg.user")).length).toBe(countBefore);

		// Clean up
		await input.setValue("");
	});

	// =========================================================================
	// Sending a long prompt
	// =========================================================================

	it("can send a long prompt (200+ chars)", async () => {
		const input = await $("#input");
		const messages = await $("#messages");
		const countBefore = (await messages.$$(".msg.user")).length;

		const longText =
			"This is a very long prompt that tests the textarea and message bubble rendering. " +
			"It contains multiple sentences to ensure that the layout handles long content gracefully " +
			"and that the full text appears inside the assistant conversation area without truncation.";

		await input.setValue(longText);
		await pressKey("#input", "Enter");

		await browser.waitUntil(
			async () => (await messages.$$(".msg.user")).length > countBefore,
			{ timeout: 5_000, interval: 100, timeoutMsg: "user bubble never appeared for long prompt" },
		);
		const userMsgs = await messages.$$(".msg.user");
		const body = await userMsgs[userMsgs.length - 1].$(".msg-body");
		expect((await body.getText()).length).toBeGreaterThan(100);

		// Wait for Ollama to finish
		await browser.waitUntil(async () => await (await $("#sendBtn")).isEnabled(), { timeout: 15_000, interval: 200 });
	});

	// =========================================================================
	// Select a model out of 2 installed models and send a prompt
	// =========================================================================

	it("selects second of two installed models and sends a prompt", async () => {
		await injectModels([MODEL_A, MODEL_B]);
		const select = await $("#modelSelect");
		await browser.waitUntil(async () => (await select.$$("option")).length >= 2, { timeout: 3_000 });

		const opts = await select.$$("option");
		const secondValue = await opts[1].getValue();
		await select.selectByAttribute("value", secondValue);
		expect(await select.getValue()).toBe(secondValue);

		const input = await $("#input");
		const messages = await $("#messages");
		const countBefore = (await messages.$$(".msg.user")).length;

		await input.setValue("Prompt sent with model B selected");
		await pressKey("#input", "Enter");

		await browser.waitUntil(
			async () => (await messages.$$(".msg.user")).length > countBefore,
			{ timeout: 5_000, interval: 100, timeoutMsg: "user bubble never appeared for model-B send" },
		);

		// Wait for Ollama to finish
		await browser.waitUntil(async () => await (await $("#sendBtn")).isEnabled(), { timeout: 15_000, interval: 200 });

		// Restore single model
		await injectModels([MODEL_A]);
	});

	// =========================================================================
	// Streaming response — real Ollama streaming populates assistant bubble
	// =========================================================================

	it("Ollama streaming: response text appears in the assistant bubble", async () => {
		const input = await $("#input");
		const messages = await $("#messages");
		const countBefore = (await messages.$$(".msg.assistant")).length;

		await input.setValue("hi");
		await pressKey("#input", "Enter");

		// Wait for the assistant shell to appear
		await browser.waitUntil(
			async () => (await messages.$$(".msg.assistant")).length > countBefore,
			{ timeout: 5_000, interval: 100, timeoutMsg: "assistant shell never appeared" },
		);

		// Wait for Ollama to stream at least some text into the bubble
		const assistants = await messages.$$(".msg.assistant");
		const lastBody = await assistants[assistants.length - 1].$(".msg-body");
		await browser.waitUntil(
			async () => (await lastBody.getText()).trim().length > 0,
			{ timeout: 15_000, interval: 300, timeoutMsg: "no streaming text appeared in assistant bubble" },
		);

		// Wait for done (Send re-enabled, Cancel hidden)
		await browser.waitUntil(async () => await (await $("#sendBtn")).isEnabled(), { timeout: 15_000, interval: 200 });
		expect(await (await $("#cancelBtn")).getAttribute("class")).toContain("hidden");
		expect(await (await $("#typingIndicator")).getAttribute("class")).toContain("hidden");
	});

	// =========================================================================
	// Error response — injected error shows an error bubble
	// =========================================================================

	it("injected error message shows an error bubble", async () => {
		const input = await $("#input");
		const messages = await $("#messages");
		const countBefore = (await messages.$$(".msg.error")).length;

		await input.setValue("Trigger an error");
		await pressKey("#input", "Enter");

		// Wait for assistant shell (created synchronously on send)
		await browser.waitUntil(
			async () => (await messages.$$(".msg.assistant")).length > 0,
			{ timeout: 5_000 },
		);

		// Inject an error with the ID — works whether inFlight is active or not:
		// if active, it replaces the shell; if not (Ollama already responded),
		// it appends a standalone error bubble via the else-branch in chat.ts.
		const id = await getInFlightId();
		await injectMessage({ type: "error", id, message: "Model overloaded" });

		await browser.waitUntil(
			async () => (await messages.$$(".msg.error")).length > countBefore,
			{ timeout: 3_000, interval: 100, timeoutMsg: "error bubble never appeared" },
		);

		const errorMsgs = await messages.$$(".msg.error");
		const body = await errorMsgs[errorMsgs.length - 1].$(".msg-body");
		expect(await body.getText()).toContain("Model overloaded");

		// In-flight should be cleared (either by Ollama or by error injection)
		await browser.waitUntil(async () => await (await $("#sendBtn")).isEnabled(), { timeout: 3_000 });
	});

	// =========================================================================
	// Cancel flow
	// =========================================================================

	it("clicking Cancel immediately clears in-flight state", async () => {
		// Ollama often answers faster than WDIO can click. Run send + cancel in one
		// main-world turn so Cancel always fires before the extension finishes.
		await browser.execute(() => {
			const input = document.querySelector("#input") as HTMLTextAreaElement;
			const cancel = document.querySelector("#cancelBtn") as HTMLButtonElement;
			input.value = "Long running task that will be cancelled";
			input.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }),
			);
			cancel.click();
		});
		await browser.pause(80);

		const cancelBtn = await $("#cancelBtn");

		// onCancel sets inFlight = null and calls setInFlight(false) synchronously
		await browser.waitUntil(
			async () => (await cancelBtn.getAttribute("class")).includes("hidden"),
			{ timeout: 3_000, interval: 100, timeoutMsg: "Cancel button did not hide after click" },
		);
		await expect(await $("#sendBtn")).toBeEnabled();
		expect(await (await $("#typingIndicator")).getAttribute("class")).toContain("hidden");
	});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read the current in-flight prompt id from the last assistant bubble
 * that carries a `data-prompt-id` attribute (set by `appendAssistantShell`).
 */
async function getInFlightId(): Promise<string> {
	return browser.execute((): string => {
		const all = document.querySelectorAll<HTMLElement>(".msg.assistant[data-prompt-id]");
		const last = all[all.length - 1];
		return last?.dataset.promptId ?? "";
	});
}
