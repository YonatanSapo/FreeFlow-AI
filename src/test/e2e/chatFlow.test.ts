/**
 * Chat — service-layer integration tests
 *
 * Tests ChatManager / ChatSession directly against a live Ollama daemon.
 * DOM / UI interactions are covered by the wdio suite in src/test/wdio/.
 *
 * Requires Ollama running at http://127.0.0.1:11434.
 * Suite is auto-skipped when the daemon is unreachable.
 */

import * as assert from "assert";
import { ChatManager, SessionClosedError } from "../../core/chat/manager.js";
import { OllamaEnv, TEST_MODEL } from "../support/ollamaEnv.js";

const MODEL_ID = `ollama:${TEST_MODEL}`;

suite("Chat — service layer", () => {
	let env: OllamaEnv;
	let chatManager: ChatManager;
	let modelWasPreInstalled = false;

	suiteSetup(async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		env = await OllamaEnv.setup(this);
		chatManager = new ChatManager(env.client);

		const installed = await env.client.list();
		modelWasPreInstalled = installed.some(
			(m) => m.name === TEST_MODEL || m.name === `${TEST_MODEL}:latest`,
		);
		await env.ensureModel(TEST_MODEL);
	});

	suiteTeardown(async function (this: Mocha.Context) {
		this.timeout(60_000);
		chatManager?.closeAll();
		if (env && !modelWasPreInstalled) {
			try { await env.client.delete(TEST_MODEL); } catch { /* ignore */ }
		}
	});

	test("sendPrompt: streams non-empty tokens and full response equals joined tokens", async function (this: Mocha.Context) {
		this.timeout(60_000);
		const session = chatManager.createChat(MODEL_ID);
		const tokens: string[] = [];

		const full = await session.sendPrompt(
			"Reply with exactly one word: yes",
			(token) => { tokens.push(token); },
		);

		assert.ok(tokens.length > 0, "Expected at least one streamed token");
		assert.ok(full.length > 0, "Expected non-empty full response");
		assert.strictEqual(
			tokens.join(""),
			full,
			"Joined tokens should equal the full resolved string",
		);
		session.close();
	});

	test("sendPrompt: close() during in-flight request settles the promise", async function (this: Mocha.Context) {
		this.timeout(30_000);
		const session = chatManager.createChat(MODEL_ID);

		let settled = false;
		const p = session.sendPrompt("Count slowly from 1 to 500 spelling out each number").then(
			() => { settled = true; },
			() => { settled = true; },
		);

		await new Promise<void>((r) => setTimeout(r, 300));
		session.close();
		await p;

		assert.strictEqual(settled, true, "Promise must settle after close()");
	});

	test("sendPrompt after close() throws SessionClosedError", async () => {
		const session = chatManager.createChat(MODEL_ID);
		session.close();
		await assert.rejects(
			async () => { await session.sendPrompt("hello"); },
			SessionClosedError,
		);
	});

	test("multiple sessions for same model are independent", async function (this: Mocha.Context) {
		this.timeout(60_000);
		const s1 = chatManager.createChat(MODEL_ID);
		const s2 = chatManager.createChat(MODEL_ID);
		assert.notStrictEqual(s1.id, s2.id);

		const [r1, r2] = await Promise.all([
			s1.sendPrompt("Say: one"),
			s2.sendPrompt("Say: two"),
		]);
		assert.ok(r1.length > 0);
		assert.ok(r2.length > 0);
		s1.close();
		s2.close();
	});
});
