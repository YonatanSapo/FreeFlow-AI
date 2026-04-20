import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createToast } from "../../ui/webview/models/modules/toast.js";

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div id="toast" class="toast hidden"></div>
	</body></html>`);
	const el = dom.window.document.getElementById("toast") as HTMLElement;
	return { toast: createToast(el), el };
}

suite("Toast module", () => {
	test("show() removes the 'hidden' class", () => {
		const { toast, el } = makeDOM();
		toast.show("Hello");
		assert.ok(!el.classList.contains("hidden"));
	});

	test("show() sets textContent", () => {
		const { toast, el } = makeDOM();
		toast.show("Operation complete");
		assert.strictEqual(el.textContent, "Operation complete");
	});

	test("show() defaults to kind='info'", () => {
		const { toast, el } = makeDOM();
		toast.show("info message");
		assert.strictEqual(el.dataset.kind, "info");
	});

	test("show() with kind='error' sets data-kind=error", () => {
		const { toast, el } = makeDOM();
		toast.show("something broke", "error");
		assert.strictEqual(el.dataset.kind, "error");
	});
});
