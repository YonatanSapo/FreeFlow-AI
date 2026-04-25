import * as assert from "assert";
import { createNonce } from "../../ui/webviewUtils.js";

suite("webviewUtils", () => {
	test("createNonce: returns a 32-character string", () => {
		const n = createNonce();
		assert.strictEqual(typeof n, "string");
		assert.strictEqual(n.length, 32);
	});

	test("createNonce: contains only alphanumeric characters", () => {
		const n = createNonce();
		assert.match(n, /^[A-Za-z0-9]{32}$/);
	});

	test("createNonce: each call returns a distinct value", () => {
		const results = new Set(Array.from({ length: 20 }, () => createNonce()));
		assert.strictEqual(results.size, 20, "expected all 20 nonces to be distinct");
	});
});
