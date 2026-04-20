/**
 * Models — service-layer integration tests
 *
 * Tests ModelManager directly against a live Ollama daemon.
 * DOM / UI interactions are covered by the wdio suite in src/test/wdio/.
 *
 * Requires Ollama running at http://127.0.0.1:11434.
 * Suite is auto-skipped when the daemon is unreachable.
 */

import * as assert from "assert";
import { ModelManager } from "../../core/models/manager.js";
import { OllamaEnv, TEST_MODEL } from "../support/ollamaEnv.js";

suite("Models — service layer", () => {
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
		if (env && !modelWasPreInstalled) {
			try { await env.client.delete(TEST_MODEL); } catch { /* ignore */ }
		}
	});

	test("health probe returns ok: true when Ollama is running", async () => {
		const result = await manager.healthProbe();
		assert.strictEqual(result.ok, true, `Expected ok: true; got error: ${result.error ?? "none"}`);
	});

	test("list: includes TEST_MODEL with status installed", async () => {
		const models = await manager.list();
		const found = models.find(
			(m) => m.tag === TEST_MODEL || m.tag === `${TEST_MODEL}:latest`,
		);
		assert.ok(found, `Expected ${TEST_MODEL} in list`);
		assert.strictEqual(found.status, "installed");
	});

	test("list: no duplicate model ids", async () => {
		const models = await manager.list();
		const ids = models.map((m) => m.id);
		const unique = new Set(ids);
		assert.strictEqual(ids.length, unique.size, `Duplicate ids: ${ids.join(", ")}`);
	});

	test("install: progress includes 'success', model shows installed after", async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		try { await env.client.delete(TEST_MODEL); } catch { /* not present */ }

		const statuses: string[] = [];
		await manager.install(TEST_MODEL, (p) => {
			if (p.status) {
				statuses.push(p.status);
			}
		});

		assert.ok(
			statuses.includes("success"),
			`Expected "success" in progress events; got: ${statuses.join(", ")}`,
		);

		const models = await manager.list();
		const found = models.find(
			(m) => m.tag === TEST_MODEL || m.tag === `${TEST_MODEL}:latest`,
		);
		assert.ok(found, `Expected ${TEST_MODEL} in list after install`);
		assert.strictEqual(found.status, "installed");
	});

	test("remove: model shows not-installed after removal", async function (this: Mocha.Context) {
		this.timeout(10 * 60_000);
		await env.ensureModel(TEST_MODEL);
		await manager.remove(TEST_MODEL);

		const models = await manager.list();
		const found = models.find(
			(m) => m.tag === TEST_MODEL || m.tag === `${TEST_MODEL}:latest`,
		);
		if (found) {
			assert.strictEqual(
				found.status,
				"not-installed",
				`Expected "not-installed" after remove, got: ${found.status}`,
			);
		}
		// Restore for teardown.
		await env.ensureModel(TEST_MODEL);
	});
});
