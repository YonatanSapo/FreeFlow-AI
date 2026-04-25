/**
 * ChatManager / ChatSession unit tests with a stub OllamaClient — no network.
 */

import * as assert from "assert";
import { ChatManager, SessionClosedError } from "../../core/chat/manager.js";
import type { OllamaClient } from "../../core/ollama/client.js";
import type { GenerateChunkHandler } from "../../core/ollama/types.js";

suite("ChatManager / ChatSession — unit", () => {
	test("createChat: assigns unique session ids", () => {
		const stub = { async generate(): Promise<string> { return ""; } } as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const a = mgr.createChat("ollama:phi3:latest");
		const b = mgr.createChat("ollama:phi3:latest");
		assert.notStrictEqual(a.id, b.id);
		assert.ok(a.id.startsWith("session-"));
		assert.ok(b.id.startsWith("session-"));
	});

	test("sendPrompt: maps ollama:phi3:latest to tag passed to generate", async () => {
		let seenTag = "";
		const stub = {
			async generate(tag: string): Promise<string> {
				seenTag = tag;
				return "ok";
			},
		} as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const session = mgr.createChat("ollama:phi3:latest");
		const out = await session.sendPrompt("hello");
		assert.strictEqual(seenTag, "phi3:latest");
		assert.strictEqual(out, "ok");
		session.close();
	});

	test("sendPrompt: throws SessionClosedError after close", async () => {
		const stub = { async generate(): Promise<string> { return ""; } } as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const session = mgr.createChat("ollama:phi:latest");
		session.close();
		await assert.rejects(async () => {
			await session.sendPrompt("x");
		}, SessionClosedError);
	});

	test("close: sets session.closed to true", () => {
		const stub = { async generate(): Promise<string> { return ""; } } as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const session = mgr.createChat("ollama:a:latest");
		assert.strictEqual(session.closed, false);
		session.close();
		assert.strictEqual(session.closed, true);
	});

	test("closeAll: closes every active session", () => {
		const stub = { async generate(): Promise<string> { return ""; } } as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const s1 = mgr.createChat("ollama:a:latest");
		const s2 = mgr.createChat("ollama:b:latest");
		mgr.closeAll();
		assert.strictEqual(s1.closed, true);
		assert.strictEqual(s2.closed, true);
	});

	test("sendPrompt: resolves when generate completes after abort signal", async () => {
		const stub = {
			async generate(
				_tag: string,
				_prompt: string,
				_onChunk: GenerateChunkHandler | undefined,
				signal?: AbortSignal,
			): Promise<string> {
				await new Promise<void>((resolve) => {
					signal?.addEventListener("abort", () => resolve(), { once: true });
				});
				return "aborted-flow";
			},
		} as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const session = mgr.createChat("ollama:phi:latest");
		const p = session.sendPrompt("hi");
		session.close();
		const out = await p;
		assert.strictEqual(out, "aborted-flow");
	});

	test("getSession: returns session by id or undefined", () => {
		const stub = { async generate(): Promise<string> { return ""; } } as unknown as OllamaClient;
		const mgr = new ChatManager(stub);
		const session = mgr.createChat("ollama:x:latest");
		assert.strictEqual(mgr.getSession(session.id), session);
		assert.strictEqual(mgr.getSession("no-such-session"), undefined);
		session.close();
	});
});
