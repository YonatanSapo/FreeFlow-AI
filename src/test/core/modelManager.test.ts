/**
 * ModelManager integration tests.
 *
 * Requires a live Ollama daemon; the suite is auto-skipped when Ollama is
 * unreachable.  Uses TEST_MODEL ("qwen2.5:0.5b") which is pulled once in
 * suiteSetup and removed in suiteTeardown if it was not pre-installed.
 */

import * as assert from "assert";
import { OllamaClient } from "../../core/ollama/client.js";
import { ModelManager, KNOWN_LOCAL_MODELS } from "../../core/models/manager.js";
import { OllamaEnv, TEST_MODEL } from "../support/ollamaEnv.js";
import { canonicalTag } from "../../core/ollama/tags.js";

suite("ModelManager — integration", () => {
	let env: OllamaEnv;
	let manager: ModelManager;
	let modelWasPreInstalled = false;

	suiteSetup(async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		env = await OllamaEnv.setup(this);
		manager = new ModelManager(env.client);

		const installed = await env.client.list();
		modelWasPreInstalled = installed.some(
			(m) => m.name === TEST_MODEL || m.name === `${TEST_MODEL}:latest`,
		);
		await env.ensureModel(TEST_MODEL);
	});

	suiteTeardown(async function (this: Mocha.Context) {
		this.timeout(60_000);
		if (!modelWasPreInstalled) {
			try { await env.client.delete(TEST_MODEL); } catch { /* ignore */ }
		}
	});

	// -------------------------------------------------------------------------
	// list()
	// -------------------------------------------------------------------------

	test("list: contains all KNOWN_LOCAL_MODELS entries", async () => {
		const models = await manager.list();
		const ids = new Set(models.map((m) => m.id));
		for (const knownTag of KNOWN_LOCAL_MODELS) {
			const expectedId = `ollama:${canonicalTag(knownTag)}`;
			assert.ok(ids.has(expectedId),
				`Expected KNOWN_LOCAL_MODELS entry "${knownTag}" (id: ${expectedId}) in list`);
		}
	});

	test("list: TEST_MODEL appears with status=installed after pull", async () => {
		const models = await manager.list();
		const entry = models.find(
			(m) => m.tag === TEST_MODEL
				|| m.tag === `${TEST_MODEL}:latest`,
		);
		assert.ok(entry, `Expected ${TEST_MODEL} in list`);
		assert.strictEqual(entry.status, "installed",
			`Expected status "installed", got "${entry.status}"`);
	});

	test("list: no duplicates — canonical form deduplicates bare and qualified tags", async () => {
		const models = await manager.list();
		const ids = models.map((m) => m.id);
		const unique = new Set(ids);
		assert.strictEqual(ids.length, unique.size,
			`Duplicate ids detected: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(", ")}`);
	});

	test("list: each entry has required fields with correct types", async () => {
		const models = await manager.list();
		assert.ok(models.length > 0);
		for (const m of models) {
			assert.strictEqual(typeof m.id, "string");
			assert.strictEqual(typeof m.displayName, "string");
			assert.strictEqual(typeof m.tag, "string");
			assert.ok(
				m.status === "installed" || m.status === "not-installed" || m.status === "unavailable",
				`Unexpected status: ${m.status}`,
			);
		}
	});

	test("list: all models show unavailable when Ollama is offline", async () => {
		const offlineManager = new ModelManager(new OllamaClient({ baseUrl: "http://127.0.0.1:1" }));
		const models = await offlineManager.list();
		assert.ok(models.length > 0, "Expected at least the KNOWN_LOCAL_MODELS entries");
		assert.ok(
			models.every((m) => m.status === "unavailable"),
			`Expected all statuses to be "unavailable"; got: ${models.map((m) => m.status).join(", ")}`,
		);
	});

	// -------------------------------------------------------------------------
	// ps()
	// -------------------------------------------------------------------------

	test("ps: returns an array", async () => {
		const running = await manager.ps();
		assert.ok(Array.isArray(running));
	});

	test("ps: contains TEST_MODEL after a generate call", async function (this: Mocha.Context) {
		this.timeout(60_000);
		await env.client.generate(TEST_MODEL, "1+1=");
		const running = await manager.ps();
		const loaded = running.some(
			(r) => r.name === TEST_MODEL || r.name === `${TEST_MODEL}:latest`
				|| r.model === TEST_MODEL || r.model === `${TEST_MODEL}:latest`,
		);
		assert.ok(loaded,
			`Expected ${TEST_MODEL} in ps() after generate; got: ${running.map((r) => r.name).join(", ")}`);
	});

	// -------------------------------------------------------------------------
	// install() / remove()
	// -------------------------------------------------------------------------

	test("install: pulls a model and it appears in list()", async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		// Delete first so we test a real pull.
		try { await env.client.delete(TEST_MODEL); } catch { /* not present — fine */ }

		const progressEvents: string[] = [];
		await manager.install(TEST_MODEL, (p) => {
			if (p.status) {
				progressEvents.push(p.status);
			}
		});

		assert.ok(progressEvents.includes("success"),
			`Expected a "success" progress event; got: ${progressEvents.join(", ")}`);

		const models = await manager.list();
		const installed = models.find(
			(m) => m.tag === TEST_MODEL || m.tag === `${TEST_MODEL}:latest`,
		);
		assert.ok(installed, `Expected ${TEST_MODEL} to appear in list() after install`);
		assert.strictEqual(installed.status, "installed");
	});

	test("remove: deletes a model and it shows not-installed in list()", async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		// Ensure the model is present before we remove it.
		await env.ensureModel(TEST_MODEL);

		await manager.remove(TEST_MODEL);

		const models = await manager.list();
		const entry = models.find(
			(m) => m.tag === TEST_MODEL || m.tag === `${TEST_MODEL}:latest`,
		);
		if (entry) {
			assert.strictEqual(entry.status, "not-installed",
				`Expected "not-installed" after remove, got "${entry.status}"`);
		}
		// If the model was not in KNOWN_LOCAL_MODELS it simply won't appear in
		// the list at all — both outcomes are acceptable.

		// Re-install so the suite teardown works correctly.
		await env.ensureModel(TEST_MODEL);
	});
});
