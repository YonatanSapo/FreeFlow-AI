import * as assert from "assert";
import { GeminiProvider, GEMINI_ID } from "../../../providers/cloud/geminiProvider";

suite("GeminiProvider (stub)", () => {
	test("has cloud type, stable id, non-empty displayName", () => {
		const p = new GeminiProvider();
		assert.strictEqual(p.type, "cloud");
		assert.strictEqual(p.id, GEMINI_ID);
		assert.ok(p.displayName.length > 0);
	});

	test("sendPrompt rejects with Not implemented", async () => {
		const p = new GeminiProvider("key");
		await assert.rejects(() => p.sendPrompt("hello"), /Not implemented/);
	});

	test("isAvailable resolves false", async () => {
		assert.strictEqual(await new GeminiProvider("key").isAvailable(), false);
	});
});
