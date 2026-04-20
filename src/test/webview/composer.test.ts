import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createComposer } from "../../ui/webview/chat/modules/composer.js";

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<textarea id="input" rows="1"></textarea>
		<button id="sendBtn">Send</button>
		<button id="cancelBtn" class="hidden">Stop</button>
		<div id="typingIndicator" class="hidden"></div>
	</body></html>`);
	const { window } = dom;
	const { document } = window;
	const sentMessages: string[] = [];
	let cancelled = false;

	const composer = createComposer(
		document.getElementById("input") as HTMLTextAreaElement,
		document.getElementById("sendBtn") as HTMLButtonElement,
		document.getElementById("cancelBtn") as HTMLButtonElement,
		document.getElementById("typingIndicator") as HTMLElement,
		(text) => sentMessages.push(text),
		() => { cancelled = true; },
	);

	function pressKey(target: HTMLElement, key: string, mods: Partial<KeyboardEventInit> = {}): void {
		target.dispatchEvent(new window.KeyboardEvent("keydown", { key, code: key, bubbles: true, ...mods }));
	}

	return { document, composer, sentMessages, isCancelled: () => cancelled, pressKey };
}

suite("Composer module", () => {
	test("clicking Send fires onSend with trimmed textarea value", () => {
		const { document, sentMessages } = makeDOM();
		(document.getElementById("input") as HTMLTextAreaElement).value = "Hello world";
		(document.getElementById("sendBtn") as HTMLButtonElement).click();
		assert.deepStrictEqual(sentMessages, ["Hello world"]);
	});

	test("clicking Send with blank textarea does NOT fire onSend", () => {
		const { document, sentMessages } = makeDOM();
		(document.getElementById("input") as HTMLTextAreaElement).value = "   ";
		(document.getElementById("sendBtn") as HTMLButtonElement).click();
		assert.strictEqual(sentMessages.length, 0);
	});

	test("Enter key fires onSend", () => {
		const { document, sentMessages, pressKey } = makeDOM();
		const textarea = document.getElementById("input") as HTMLTextAreaElement;
		textarea.value = "Ping";
		pressKey(textarea, "Enter");
		assert.deepStrictEqual(sentMessages, ["Ping"]);
	});

	test("Ctrl+Enter fires onSend", () => {
		const { document, sentMessages, pressKey } = makeDOM();
		const textarea = document.getElementById("input") as HTMLTextAreaElement;
		textarea.value = "Ctrl ping";
		pressKey(textarea, "Enter", { ctrlKey: true });
		assert.deepStrictEqual(sentMessages, ["Ctrl ping"]);
	});

	test("Meta+Enter fires onSend", () => {
		const { document, sentMessages, pressKey } = makeDOM();
		const textarea = document.getElementById("input") as HTMLTextAreaElement;
		textarea.value = "Meta ping";
		pressKey(textarea, "Enter", { metaKey: true });
		assert.deepStrictEqual(sentMessages, ["Meta ping"]);
	});

	test("Shift+Enter does NOT fire onSend", () => {
		const { document, sentMessages, pressKey } = makeDOM();
		const textarea = document.getElementById("input") as HTMLTextAreaElement;
		textarea.value = "line one";
		pressKey(textarea, "Enter", { shiftKey: true });
		assert.strictEqual(sentMessages.length, 0, "Shift+Enter must not send");
	});

	test("onSend receives the full text of a long prompt", () => {
		const { document, sentMessages } = makeDOM();
		const longText = "x".repeat(300);
		(document.getElementById("input") as HTMLTextAreaElement).value = longText;
		(document.getElementById("sendBtn") as HTMLButtonElement).click();
		assert.strictEqual(sentMessages[0], longText);
	});

	test("Send clears the textarea after firing", () => {
		const { document } = makeDOM();
		const textarea = document.getElementById("input") as HTMLTextAreaElement;
		textarea.value = "Some text";
		(document.getElementById("sendBtn") as HTMLButtonElement).click();
		assert.strictEqual(textarea.value, "");
	});

	test("setInFlight(true) disables send, shows cancel + typing indicator", () => {
		const { document, composer } = makeDOM();
		composer.setInFlight(true);
		assert.ok((document.getElementById("sendBtn") as HTMLButtonElement).disabled);
		assert.ok(!(document.getElementById("cancelBtn") as HTMLButtonElement).classList.contains("hidden"));
		assert.ok(!(document.getElementById("typingIndicator") as HTMLElement).classList.contains("hidden"));
	});

	test("setInFlight(false) re-enables send, hides cancel + typing indicator", () => {
		const { document, composer } = makeDOM();
		composer.setInFlight(true);
		composer.setInFlight(false);
		assert.ok(!(document.getElementById("sendBtn") as HTMLButtonElement).disabled);
		assert.ok((document.getElementById("cancelBtn") as HTMLButtonElement).classList.contains("hidden"));
		assert.ok((document.getElementById("typingIndicator") as HTMLElement).classList.contains("hidden"));
	});

	test("clicking Cancel fires onCancel", () => {
		const { document, isCancelled } = makeDOM();
		(document.getElementById("cancelBtn") as HTMLButtonElement).click();
		assert.ok(isCancelled());
	});
});
