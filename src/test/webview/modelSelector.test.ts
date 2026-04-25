import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createModelSelector } from "../../ui/webview/chat/modules/modelSelector.js";

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<select id="modelSelect"></select>
	</body></html>`);
	const select = dom.window.document.getElementById("modelSelect") as HTMLSelectElement;
	return { select, ms: createModelSelector(select) };
}

suite("ModelSelector module", () => {
	test("render() builds one option per model", () => {
		const { select, ms } = makeDOM();
		ms.render([
			{ id: "a", tag: "a", displayName: "Model A", status: "installed" },
			{ id: "b", tag: "b", displayName: "Model B", status: "not-installed" },
		]);
		assert.strictEqual(select.options.length, 2);
	});

	test("installed options are enabled; not-installed are disabled", () => {
		const { select, ms } = makeDOM();
		ms.render([
			{ id: "a", tag: "a", displayName: "A", status: "installed" },
			{ id: "b", tag: "b", displayName: "B", status: "not-installed" },
		]);
		assert.strictEqual(select.options[0].disabled, false);
		assert.strictEqual(select.options[1].disabled, true);
	});

	test("getSelectedId() returns first installed when nothing was selected", () => {
		const { select, ms } = makeDOM();
		ms.render([
			{ id: "x", tag: "x", displayName: "X", status: "not-installed" },
			{ id: "y", tag: "y", displayName: "Y", status: "installed" },
		]);
		assert.strictEqual(ms.getSelectedId(), "y");
	});

	test("preserves selection when same id still exists after re-render", () => {
		const { select, ms } = makeDOM();
		ms.render([
			{ id: "a", tag: "a", displayName: "A", status: "installed" },
			{ id: "b", tag: "b", displayName: "B", status: "installed" },
		]);
		select.value = "b";
		ms.render([
			{ id: "a", tag: "a", displayName: "A", status: "installed" },
			{ id: "b", tag: "b", displayName: "B", status: "installed" },
		]);
		assert.strictEqual(ms.getSelectedId(), "b");
	});
});
