import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createStatusIndicator } from "../../ui/webview/models/modules/statusIndicator.js";

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<span id="dot" class="dot initializing"></span>
		<span id="label">Checking…</span>
		<div id="instructions" class="instructions hidden"></div>
	</body></html>`);
	const doc = dom.window.document;
	return {
		dot:          doc.getElementById("dot") as HTMLSpanElement,
		label:        doc.getElementById("label") as HTMLSpanElement,
		instructions: doc.getElementById("instructions") as HTMLElement,
	};
}

suite("StatusIndicator module", () => {
	test("setInitializing() — dot gets 'initializing' class, label reads 'Checking…', instructions hidden", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setInitializing();

		assert.ok(dot.className.includes("initializing"), `class="${dot.className}"`);
		assert.strictEqual(label.textContent, "Checking…");
		assert.ok(instructions.classList.contains("hidden"));
	});

	test("setRunning() — dot gets 'running' class, label reads 'Running', instructions hidden", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setRunning();

		assert.ok(dot.className.includes("running"), `class="${dot.className}"`);
		assert.strictEqual(label.textContent, "Running");
		assert.ok(instructions.classList.contains("hidden"));
	});

	test("setDown(darwin) — dot gets 'not-installed' class, label contains 'Not running', instructions visible", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setDown("darwin");

		assert.ok(dot.className.includes("not-installed"), `class="${dot.className}"`);
		assert.ok(label.textContent?.includes("Not running"), `label="${label.textContent}"`);
		assert.ok(!instructions.classList.contains("hidden"));
	});

	test("setDown(darwin, error) — label includes the error message", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setDown("darwin", "ECONNREFUSED");

		assert.ok(label.textContent?.includes("ECONNREFUSED"), `label="${label.textContent}"`);
		assert.ok(!instructions.classList.contains("hidden"));
	});

	test("setDown(win32) — instructions contain winget command", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setDown("win32");

		assert.ok(instructions.textContent?.includes("winget"), `instructions="${instructions.textContent}"`);
	});

	test("setDown(linux) — instructions contain curl command", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setDown("linux");

		assert.ok(instructions.textContent?.includes("curl"), `instructions="${instructions.textContent}"`);
	});

	test("transition: setDown then setRunning hides instructions", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setDown("darwin");
		assert.ok(!instructions.classList.contains("hidden"), "should be visible after setDown");

		si.setRunning();
		assert.ok(instructions.classList.contains("hidden"), "should be hidden after setRunning");
	});

	test("transition: setRunning then setDown shows instructions again", () => {
		const { dot, label, instructions } = makeDOM();
		const si = createStatusIndicator(dot, label, instructions);

		si.setRunning();
		si.setDown("darwin");

		assert.ok(!instructions.classList.contains("hidden"));
		assert.ok(dot.className.includes("not-installed"));
	});
});
