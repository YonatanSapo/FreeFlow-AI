import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createModelList } from "../../ui/webview/models/modules/modelList.js";

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<ul id="localList"></ul>
	</body></html>`);
	const doc = dom.window.document;
	const installCalls: string[] = [];
	const removeCalls: string[] = [];
	const modelList = createModelList(
		doc.getElementById("localList") as HTMLUListElement,
		(tag) => installCalls.push(tag),
		(tag) => removeCalls.push(tag),
	);
	return { doc, modelList, installCalls, removeCalls };
}

const MODEL_A = { id: "ollama:modelA", tag: "modelA", displayName: "Model A", status: "installed" as const };
const MODEL_B = { id: "ollama:modelB", tag: "modelB", displayName: "Model B", status: "not-installed" as const };

suite("ModelList module", () => {
	test("render() with empty list produces no rows", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([]);
		assert.strictEqual(doc.querySelectorAll("#localList li").length, 0);
	});

	test("render() shows one row per model", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A, MODEL_B]);
		assert.strictEqual(doc.querySelectorAll("#localList li").length, 2);
	});

	test("installed model row shows a Remove button", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A]);
		const btn = doc.querySelector("#localList li button") as HTMLButtonElement;
		assert.ok(btn, "button should exist");
		assert.strictEqual(btn.textContent, "Remove");
	});

	test("not-installed model row shows an Install button", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_B]);
		const btn = doc.querySelector("#localList li button") as HTMLButtonElement;
		assert.ok(btn);
		assert.strictEqual(btn.textContent, "Install");
	});

	test("clicking Install fires onInstall with the correct tag", () => {
		const { doc, modelList, installCalls } = makeDOM();
		modelList.render([MODEL_B]);
		const btn = doc.querySelector("#localList li button") as HTMLButtonElement;
		btn.click();
		assert.deepStrictEqual(installCalls, ["modelB"]);
	});

	test("clicking Remove fires onRemove with the correct tag", () => {
		const { doc, modelList, removeCalls } = makeDOM();
		modelList.render([MODEL_A]);
		const btn = doc.querySelector("#localList li button") as HTMLButtonElement;
		btn.click();
		assert.deepStrictEqual(removeCalls, ["modelA"]);
	});

	test("model display name is visible in the row", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A, MODEL_B]);
		const names = Array.from(doc.querySelectorAll("#localList .name")).map((n) => n.textContent);
		assert.ok(names.includes("Model A"));
		assert.ok(names.includes("Model B"));
	});

	test("setProgress() adds a progress bar to the correct row", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A, MODEL_B]);
		modelList.setProgress(MODEL_A.id, "downloading", 50_000_000, 100_000_000);
		const rows = doc.querySelectorAll("#localList li");
		const bar = rows[0].querySelector(".progress-bar") as HTMLElement;
		assert.ok(bar, "progress-bar should exist on MODEL_A row");
		assert.strictEqual(bar.style.width, "50%");
	});

	test("setProgress() on unknown modelId is a no-op", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A]);
		assert.doesNotThrow(() => modelList.setProgress("unknown:id", "dl", 1, 1));
		assert.strictEqual(doc.querySelectorAll(".progress-bar").length, 0);
	});

	test("clearProgress() removes the progress bar", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A]);
		modelList.setProgress(MODEL_A.id, "downloading", 10, 100);
		assert.strictEqual(doc.querySelectorAll(".progress-bar").length, 1);
		modelList.clearProgress(MODEL_A.id);
		assert.strictEqual(doc.querySelectorAll(".progress-bar").length, 0);
	});

	test("re-render clears previous rows and rebuilds", () => {
		const { doc, modelList } = makeDOM();
		modelList.render([MODEL_A, MODEL_B]);
		assert.strictEqual(doc.querySelectorAll("#localList li").length, 2);
		modelList.render([MODEL_A]);
		assert.strictEqual(doc.querySelectorAll("#localList li").length, 1);
	});
});
