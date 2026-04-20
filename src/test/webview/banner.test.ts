import * as assert from "assert";
import { JSDOM } from "jsdom";
import { createBanner } from "../../ui/webview/chat/modules/banner.js";

function makeDOM() {
	const dom = new JSDOM(`<!DOCTYPE html><html><body>
		<div id="banner" class="banner hidden" role="alert">
			<span id="bannerText"></span>
			<button id="retry" type="button">Retry</button>
		</div>
	</body></html>`);
	const doc = dom.window.document;
	let retries = 0;
	const banner = createBanner(
		doc.getElementById("banner") as HTMLElement,
		doc.getElementById("bannerText") as HTMLElement,
		doc.getElementById("retry") as HTMLButtonElement,
		() => { retries++; },
	);
	return { doc, banner, retries: () => retries };
}

suite("Banner module", () => {
	test("hide() — banner has hidden class", () => {
		const { doc, banner } = makeDOM();
		const el = doc.getElementById("banner") as HTMLElement;
		el.classList.remove("hidden");
		banner.hide();
		assert.ok(el.classList.contains("hidden"));
	});

	test("show(text) — banner visible and text set", () => {
		const { doc, banner } = makeDOM();
		const el = doc.getElementById("banner") as HTMLElement;
		const text = doc.getElementById("bannerText") as HTMLElement;
		banner.show("Ollama is offline");
		assert.ok(!el.classList.contains("hidden"));
		assert.strictEqual(text.textContent, "Ollama is offline");
	});

	test("retry button invokes callback", () => {
		const { doc, banner, retries } = makeDOM();
		banner.show("error");
		const btn = doc.getElementById("retry") as HTMLButtonElement;
		btn.click();
		assert.strictEqual(retries(), 1);
	});

	test("show then hide clears visibility", () => {
		const { doc, banner } = makeDOM();
		const el = doc.getElementById("banner") as HTMLElement;
		banner.show("x");
		assert.ok(!el.classList.contains("hidden"));
		banner.hide();
		assert.ok(el.classList.contains("hidden"));
	});
});
