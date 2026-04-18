import * as assert from "assert";
import { PerplexityProvider, PERPLEXITY_ID } from "../../../providers/cloud/perplexityProvider";

suite("PerplexityProvider (stub)", () => {
	test("has cloud type, stable id, non-empty displayName", () => {
		const p = new PerplexityProvider();
		assert.strictEqual(p.type, "cloud");
		assert.strictEqual(p.id, PERPLEXITY_ID);
		assert.ok(p.displayName.length > 0);
	});

	test("sendPrompt rejects with Not implemented", async () => {
		const p = new PerplexityProvider("key");
		await assert.rejects(() => p.sendPrompt("hello"), /Not implemented/);
	});

	test("isAvailable resolves false", async () => {
		assert.strictEqual(await new PerplexityProvider("key").isAvailable(), false);
	});
});
