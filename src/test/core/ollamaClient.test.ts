/**
 * OllamaClient integration tests.
 *
 * These tests require a live Ollama daemon.  When the daemon is not reachable
 * the entire suite is skipped automatically via `OllamaEnv.setup()`.
 *
 * The suite uses `TEST_MODEL` ("qwen2.5:0.5b") — the smallest available tag.
 * It is pulled once in `suiteSetup` if not already installed, then removed in
 * `suiteTeardown` to leave the daemon in the same state it was found in.
 */

import * as assert from "assert";
import { OllamaClient } from "../../core/ollama/client.js";
import { OllamaHttpError, OllamaUnreachableError } from "../../core/errors.js";
import { OllamaEnv, TEST_MODEL } from "../support/ollamaEnv.js";
import type { PullProgress } from "../../core/ollama/types.js";

suite("OllamaClient — integration", () => {
	let env: OllamaEnv;
	let modelWasPreInstalled = false;

	// -------------------------------------------------------------------------
	// Suite lifecycle
	// -------------------------------------------------------------------------

	suiteSetup(async function (this: Mocha.Context) {
		// suiteSetup timeout is inherited from .vscode-test.mjs (30 s), but
		// pulling a model can take much longer on the first run.
		this.timeout(10 * 60_000); // 10 minutes
		env = await OllamaEnv.setup(this);

		// Detect whether the model was present before this run so we can
		// restore that state in teardown.
		const installed = await env.client.list();
		modelWasPreInstalled = installed.some(
			(m) => m.name === TEST_MODEL || m.name === `${TEST_MODEL}:latest`,
		);

		await env.ensureModel(TEST_MODEL);
	});

	suiteTeardown(async function (this: Mocha.Context) {
		this.timeout(60_000);
		if (!modelWasPreInstalled) {
			// Best-effort removal — don't fail teardown if already gone.
			try {
				await env.client.delete(TEST_MODEL);
			} catch {
				// ignore
			}
		}
	});

	// -------------------------------------------------------------------------
	// health()
	// -------------------------------------------------------------------------

	test("health: returns ok=true when daemon is running", async () => {
		const result = await env.client.health();
		assert.strictEqual(result.ok, true);
		assert.strictEqual(result.error, undefined);
	});

	test("health: returns ok=false when daemon is unreachable (port 1)", async () => {
		const offline = new OllamaClient({ baseUrl: "http://127.0.0.1:1" });
		const result = await offline.health();
		assert.strictEqual(result.ok, false);
		assert.ok(typeof result.error === "string" && result.error.length > 0,
			"error message should be non-empty");
	});

	// -------------------------------------------------------------------------
	// list()
	// -------------------------------------------------------------------------

	test("list: includes the test model after pull", async () => {
		const tags = await env.client.list();
		const found = tags.some(
			(t) => t.name === TEST_MODEL || t.name === `${TEST_MODEL}:latest`,
		);
		assert.ok(found, `Expected ${TEST_MODEL} in list; got: ${tags.map((t) => t.name).join(", ")}`);
	});

	test("list: each entry has name, size (number), and modified (string)", async () => {
		const tags = await env.client.list();
		assert.ok(tags.length > 0, "Expected at least one installed model");
		for (const t of tags) {
			assert.strictEqual(typeof t.name, "string");
			assert.strictEqual(typeof t.size, "number");
			assert.strictEqual(typeof t.modified, "string");
		}
	});

	test("list: throws OllamaUnreachableError when daemon is offline", async () => {
		const offline = new OllamaClient({ baseUrl: "http://127.0.0.1:1" });
		await assert.rejects(
			() => offline.list(),
			(err: unknown) => {
				assert.ok(err instanceof OllamaUnreachableError, `Expected OllamaUnreachableError, got: ${err}`);
				return true;
			},
		);
	});

	// -------------------------------------------------------------------------
	// ps()
	// -------------------------------------------------------------------------

	test("ps: returns an array (possibly empty when no model is loaded)", async () => {
		const running = await env.client.ps();
		assert.ok(Array.isArray(running));
	});

	test("ps: contains the model immediately after a generate call", async function (this: Mocha.Context) {
		this.timeout(60_000);
		// Warm up the model by sending a minimal generate request.
		await env.client.generate(TEST_MODEL, "1+1=", undefined, undefined);

		const running = await env.client.ps();
		const loaded = running.some(
			(r) => r.name === TEST_MODEL || r.name === `${TEST_MODEL}:latest`
				|| r.model === TEST_MODEL || r.model === `${TEST_MODEL}:latest`,
		);
		assert.ok(loaded,
			`Expected ${TEST_MODEL} in ps() after generate; got: ${running.map((r) => r.name).join(", ")}`);
	});

	// -------------------------------------------------------------------------
	// pull() — install
	// -------------------------------------------------------------------------

	test("pull: sanity — progress events are emitted and status:success is received", async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		// Model is already installed from suiteSetup; Ollama still streams pull
		// events for a re-pull (manifest + digest checks).
		const events: PullProgress[] = [];
		await env.client.pull(TEST_MODEL, (p) => events.push(p));

		assert.ok(events.length > 0, "Expected at least one progress event");
		const last = events[events.length - 1];
		assert.strictEqual(last.status, "success",
			`Expected last event to have status "success", got: ${JSON.stringify(last)}`);
	});

	test("pull: error code — rejects with a readable message for a non-existent tag", async function (this: Mocha.Context) {
		this.timeout(30_000);
		await assert.rejects(
			() => env.client.pull("thereisnosuchtag:zzz99"),
			(err: unknown) => {
				assert.ok(err instanceof Error, "Expected an Error");
				// Ollama returns an inline error in the NDJSON stream; our client
				// wraps it as a plain Error with the original message.
				assert.ok(
					(err as Error).message.length > 0,
					"Expected a non-empty error message",
				);
				return true;
			},
		);
	});

	// -------------------------------------------------------------------------
	// delete()
	// -------------------------------------------------------------------------

	test("delete: removes the model from list()", async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		// Re-pull so we have something to delete (teardown will already have
		// pulled it; this avoids depending on test-execution order).
		await env.client.pull(TEST_MODEL);

		await env.client.delete(TEST_MODEL);

		const tags = await env.client.list();
		const stillPresent = tags.some(
			(t) => t.name === TEST_MODEL || t.name === `${TEST_MODEL}:latest`,
		);
		assert.ok(!stillPresent, `Expected ${TEST_MODEL} to be removed, but it is still listed`);

		// Re-pull so subsequent tests that rely on the model still work.
		await env.client.pull(TEST_MODEL);
	});

	test("delete: throws OllamaHttpError for an unknown model", async () => {
		await assert.rejects(
			() => env.client.delete("thereisnosuchtag:zzz99"),
			(err: unknown) => {
				// Ollama returns 404 for an unknown model
				assert.ok(err instanceof OllamaHttpError, `Expected OllamaHttpError, got: ${err}`);
				return true;
			},
		);
	});
});
