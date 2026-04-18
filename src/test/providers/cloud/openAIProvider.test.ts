import * as assert from "assert";
import { OpenAIProvider, OPENAI_ID } from "../../../providers/cloud/openAIProvider";

suite("OpenAIProvider (stub)", () => {
	test("has cloud type, stable id, non-empty displayName", () => {
		const p = new OpenAIProvider();
		assert.strictEqual(p.type, "cloud");
		assert.strictEqual(p.id, OPENAI_ID);
		assert.ok(p.displayName.length > 0);
	});

	test("hasKey reflects constructor arg", () => {
		assert.strictEqual(new OpenAIProvider().hasKey(), false);
		assert.strictEqual(new OpenAIProvider("").hasKey(), false);
		assert.strictEqual(new OpenAIProvider("sk-xyz").hasKey(), true);
	});

	test("sendPrompt rejects with Not implemented", async () => {
		const p = new OpenAIProvider("sk-xyz");
		await assert.rejects(() => p.sendPrompt("hello"), /Not implemented/);
	});

	test("isAvailable resolves false", async () => {
		const p = new OpenAIProvider("sk-xyz");
		assert.strictEqual(await p.isAvailable(), false);
	});
});
