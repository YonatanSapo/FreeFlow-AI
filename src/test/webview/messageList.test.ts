import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createMessageList } from "../../ui/webview/chat/modules/messageList.js";

/** Trivial renderer for tests — no external deps needed. */
function testRenderer(raw: string): string {
	return `<p>${raw.replace(/</g, "&lt;")}</p>`;
}

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div id="messages"></div>
	</body></html>`);
	const container = dom.window.document.getElementById("messages") as HTMLElement;
	return { container, ml: createMessageList(container, testRenderer) };
}

suite("MessageList module", () => {
	test("appendUser() adds a .msg.user div with the text", () => {
		const { container, ml } = makeDOM();
		ml.appendUser("Hello from user");
		const msg = container.querySelector(".msg.user");
		assert.ok(msg, ".msg.user should exist");
		assert.ok(msg.querySelector(".msg-body")?.textContent?.includes("Hello from user"));
	});

	test("appendAssistantShell() adds a .msg.assistant div with data-prompt-id", () => {
		const { container, ml } = makeDOM();
		const bodyEl = ml.appendAssistantShell("id-123");
		const wrap = container.querySelector(".msg.assistant") as HTMLElement;
		assert.ok(wrap, ".msg.assistant should exist");
		assert.strictEqual((wrap as HTMLElement).dataset.promptId, "id-123");
		assert.ok(bodyEl.classList.contains("msg-body"));
	});

	test("appendChunk() accumulates markdown and renders it into bodyEl", () => {
		const { ml } = makeDOM();
		const bodyEl = ml.appendAssistantShell("id-1");
		const md1 = ml.appendChunk(bodyEl, "Hello", "");
		assert.strictEqual(md1, "Hello");
		assert.ok(bodyEl.innerHTML.includes("Hello"));

		const md2 = ml.appendChunk(bodyEl, " world", md1);
		assert.strictEqual(md2, "Hello world");
		assert.ok(bodyEl.innerHTML.includes("Hello world"));
	});

	test("appendChunk() attaches code-copy button to <pre> elements", () => {
		const { ml } = makeDOM();
		const bodyEl = ml.appendAssistantShell("id-pre");
		// Render raw HTML directly for this test via a custom renderer
		const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="m"></div></body></html>`);
		const container2 = dom.window.document.getElementById("m") as HTMLElement;
		const ml2 = createMessageList(container2, () => `<pre><code>console.log("hi")</code></pre>`);
		const b = ml2.appendAssistantShell("x");
		ml2.appendChunk(b, "ignored", "");
		assert.ok(b.querySelector(".code-copy"), "code-copy button should be attached to <pre>");
	});

	test("appendError() with bodyEl marks wrap as error and sets text", () => {
		const { container, ml } = makeDOM();
		const bodyEl = ml.appendAssistantShell("id-err");
		ml.appendError("Something went wrong", bodyEl);
		const wrap = container.querySelector(".msg.error");
		assert.ok(wrap, ".msg.error class should be added to wrap");
		assert.ok(bodyEl.textContent?.includes("Something went wrong"));
	});

	test("appendError() without bodyEl appends a standalone error bubble", () => {
		const { container, ml } = makeDOM();
		ml.appendError("Standalone error");
		const wrap = container.querySelector(".msg.error");
		assert.ok(wrap, "standalone .msg.error should be appended");
		assert.ok(wrap.querySelector(".msg-body")?.textContent?.includes("Standalone error"));
	});

	test("multiple messages are appended in order", () => {
		const { container, ml } = makeDOM();
		ml.appendUser("First");
		ml.appendAssistantShell("a1");
		ml.appendUser("Second");
		const msgs = container.querySelectorAll(".msg");
		assert.strictEqual(msgs.length, 3);
		assert.ok(msgs[0].classList.contains("user"));
		assert.ok(msgs[1].classList.contains("assistant"));
		assert.ok(msgs[2].classList.contains("user"));
	});

	test("renderer is called with accumulated markdown, not individual deltas", () => {
		const rendered: string[] = [];
		const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="m"></div></body></html>`);
		const container = dom.window.document.getElementById("m") as HTMLElement;
		const ml = createMessageList(container, (raw) => { rendered.push(raw); return `<p>${raw}</p>`; });

		const body = ml.appendAssistantShell("x");
		ml.appendChunk(body, "A", "");
		ml.appendChunk(body, "B", "A");
		ml.appendChunk(body, "C", "AB");

		assert.deepStrictEqual(rendered, ["A", "AB", "ABC"]);
	});

	test("XSS: test renderer escapes < so no script executes", () => {
		const { ml } = makeDOM();
		const body = ml.appendAssistantShell("xss");
		ml.appendChunk(body, "<script>evil()</script>", "");
		assert.ok(!body.innerHTML.includes("<script>"), "raw <script> must not appear in innerHTML");
	});
});
