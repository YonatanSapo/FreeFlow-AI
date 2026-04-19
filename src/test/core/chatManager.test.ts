/**
 * ChatManager / ChatSession integration tests.
 *
 * Requires a live Ollama daemon; the suite is auto-skipped when Ollama is
 * unreachable.  Uses TEST_MODEL ("qwen2.5:0.5b") pulled once in suiteSetup.
 *
 * Test for "model goes down mid-stream" uses a real fetch wrapper that lets
 * N bytes through and then destroys the response body — it wraps the real
 * fetch rather than replacing the whole client so the request is still real.
 */

import * as assert from "assert";
import { OllamaClient, DEFAULT_OLLAMA_BASE_URL } from "../../core/ollama/client.js";
import { ChatManager, ChatSession, SessionClosedError, OllamaUnreachableError } from "../../core/chat/manager.js";
import { OllamaHttpError } from "../../core/errors.js";
import { OllamaEnv, TEST_MODEL } from "../support/ollamaEnv.js";

suite("ChatManager — integration", () => {
	let env: OllamaEnv;
	let manager: ChatManager;
	let modelWasPreInstalled = false;

	suiteSetup(async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		env = await OllamaEnv.setup(this);
		manager = new ChatManager(env.client);

		const installed = await env.client.list();
		modelWasPreInstalled = installed.some(
			(m) => m.name === TEST_MODEL || m.name === `${TEST_MODEL}:latest`,
		);
		await env.ensureModel(TEST_MODEL);

		// Verify the model is ready for inference.  Ollama can report the model
		// as present in /api/tags before the binary blobs are fully committed
		// after a pull — this warm-up retries up to 3 times with a re-pull on
		// each 404 so the tests never run against a model that isn't ready.
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				await env.client.generate(TEST_MODEL, "1");
				break;
			} catch (err) {
				if (err instanceof OllamaHttpError && err.status === 404 && attempt < 3) {
					console.log(`[chatManager] Warm-up generate got 404, re-pulling (attempt ${attempt})…`);
					await env.client.pull(TEST_MODEL);
				} else {
					throw err;
				}
			}
		}
	});

	suiteTeardown(async function (this: Mocha.Context) {
		this.timeout(60_000);
		// suiteSetup may have called skip() — env/manager are never assigned.
		manager?.closeAll();
		if (env && !modelWasPreInstalled) {
			try { await env.client.delete(TEST_MODEL); } catch { /* ignore */ }
		}
	});

	// -------------------------------------------------------------------------
	// createChat()
	// -------------------------------------------------------------------------

	test("createChat: returns a session with the requested modelId", () => {
		const session = manager.createChat(`ollama:${TEST_MODEL}`);
		assert.strictEqual(session.modelId, `ollama:${TEST_MODEL}`);
		assert.strictEqual(typeof session.id, "string");
		assert.ok(session.id.length > 0);
		assert.strictEqual(session.closed, false);
		manager.closeChat(session.id);
	});

	test("createChat: each call returns a distinct session id", () => {
		const s1 = manager.createChat(`ollama:${TEST_MODEL}`);
		const s2 = manager.createChat(`ollama:${TEST_MODEL}`);
		assert.notStrictEqual(s1.id, s2.id);
		manager.closeChat(s1.id);
		manager.closeChat(s2.id);
	});

	test("getSession: returns the session by id, undefined after closeChat", () => {
		const session = manager.createChat(`ollama:${TEST_MODEL}`);
		assert.strictEqual(manager.getSession(session.id), session);
		manager.closeChat(session.id);
		assert.strictEqual(manager.getSession(session.id), undefined);
	});

	// -------------------------------------------------------------------------
	// sendPrompt()
	// -------------------------------------------------------------------------

	test("sendPrompt: streams tokens and resolves to a non-empty string", async function (this: Mocha.Context) {
		this.timeout(60_000);
		const session = manager.createChat(`ollama:${TEST_MODEL}`);
		try {
			const chunks: string[] = [];
			const full = await session.sendPrompt("Reply with a single word: hello", (token) => {
				chunks.push(token);
			});
			assert.ok(typeof full === "string" && full.length > 0,
				"Expected a non-empty full response");
			assert.ok(chunks.length > 0, "Expected at least one streamed token");
			assert.strictEqual(chunks.join(""), full,
				"Concatenated chunks must equal the returned full string");
		} finally {
			manager.closeChat(session.id);
		}
	});

	// -------------------------------------------------------------------------
	// sendPrompt when daemon is down (before the request)
	// -------------------------------------------------------------------------

	test("sendPrompt: rejects with OllamaUnreachableError when daemon is offline", async () => {
		const offlineClient = new OllamaClient({ baseUrl: "http://127.0.0.1:1" });
		const offlineManager = new ChatManager(offlineClient);
		const session = offlineManager.createChat(`ollama:${TEST_MODEL}`);
		try {
			await assert.rejects(
				() => session.sendPrompt("ping"),
				(err: unknown) => {
					assert.ok(
						err instanceof OllamaUnreachableError,
						`Expected OllamaUnreachableError, got: ${err instanceof Error ? err.constructor.name : err}`,
					);
					return true;
				},
			);
		} finally {
			offlineManager.closeChat(session.id);
		}
	});

	// -------------------------------------------------------------------------
	// sendPrompt when daemon goes down mid-stream
	// -------------------------------------------------------------------------

	test("sendPrompt: rejects when the response body is destroyed mid-stream", async function (this: Mocha.Context) {
		this.timeout(60_000);

		// Wrap the global fetch so we intercept the generate response and
		// prematurely close its body after receiving the first chunk.
		const realFetch = globalThis.fetch.bind(globalThis);
		const wrappedFetch: typeof fetch = async (input, init) => {
			const response = await realFetch(input, init);

			// Only intercept /api/generate requests.
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
			if (!url.includes("/api/generate")) {
				return response;
			}

			// Read the first chunk, then cancel the reader to simulate a mid-stream drop.
			const reader = response.body!.getReader();
			let firstChunk: Uint8Array | undefined;
			const { value } = await reader.read();
			firstChunk = value;
			// Cancel the stream — this causes subsequent reads to get a cancelled-stream error.
			await reader.cancel("simulated mid-stream disconnect");

			// Build a new Response whose body delivers the first chunk then ends abruptly.
			const truncatedBody = new ReadableStream<Uint8Array>({
				start(controller) {
					if (firstChunk && firstChunk.length > 0) {
						controller.enqueue(firstChunk);
					}
					// Immediately error to simulate a network drop.
					controller.error(new Error("simulated mid-stream network drop"));
				},
			});

			return new Response(truncatedBody, {
				status: response.status,
				headers: response.headers,
			});
		};

		const client = new OllamaClient({ baseUrl: DEFAULT_OLLAMA_BASE_URL, fetch: wrappedFetch });
		const midstreamManager = new ChatManager(client);
		const session = midstreamManager.createChat(`ollama:${TEST_MODEL}`);

		try {
			await assert.rejects(
				() => session.sendPrompt("Count to ten slowly"),
				(err: unknown) => {
					assert.ok(err instanceof Error, `Expected an Error, got: ${err}`);
					return true;
				},
			);
			// Session must still be closeable (not left in a broken state).
			assert.strictEqual(session.closed, false,
				"Session should not auto-close on a stream error; caller decides");
			session.close();
			assert.strictEqual(session.closed, true);
		} finally {
			midstreamManager.closeAll();
		}
	});

	// -------------------------------------------------------------------------
	// close()
	// -------------------------------------------------------------------------

	test("close: in-flight sendPrompt is rejected (AbortError or generic error)", async function (this: Mocha.Context) {
		this.timeout(60_000);
		const session = manager.createChat(`ollama:${TEST_MODEL}`);

		let capturedError: unknown;
		const promptPromise = session.sendPrompt("Count from 1 to 1000 slowly").catch((e) => {
			capturedError = e;
		});

		// Give the request a moment to start then close mid-flight.
		await new Promise<void>((resolve) => setTimeout(resolve, 300));
		session.close();

		await promptPromise;

		assert.ok(capturedError instanceof Error,
			`Expected an Error from the aborted sendPrompt, got: ${capturedError}`);
		assert.strictEqual(session.closed, true);
	});

	test("close: subsequent sendPrompt throws SessionClosedError", async () => {
		const session = manager.createChat(`ollama:${TEST_MODEL}`);
		session.close();
		assert.strictEqual(session.closed, true);

		await assert.rejects(
			() => session.sendPrompt("this should not run"),
			(err: unknown) => {
				assert.ok(err instanceof SessionClosedError,
					`Expected SessionClosedError, got: ${err instanceof Error ? err.constructor.name : err}`);
				assert.ok((err as SessionClosedError).message.includes(session.id));
				return true;
			},
		);
	});

	test("closeChat: removes session from manager and closes it", () => {
		const session = manager.createChat(`ollama:${TEST_MODEL}`);
		manager.closeChat(session.id);
		assert.strictEqual(session.closed, true);
		assert.strictEqual(manager.getSession(session.id), undefined);
	});
});
