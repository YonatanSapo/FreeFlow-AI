/**
 * ModelManager unit tests with a stub OllamaClient — no live Ollama daemon.
 */

import * as assert from "assert";
import { KNOWN_LOCAL_MODELS, ModelManager } from "../../core/models/manager.js";
import type { OllamaClient } from "../../core/ollama/client.js";
import type { OllamaTag } from "../../core/ollama/types.js";

function makeClient(overrides: Partial<{
	health: () => Promise<{ ok: boolean; error?: string }>;
	list: () => Promise<OllamaTag[]>;
}>): OllamaClient {
	return {
		health: overrides.health ?? (async () => ({ ok: true })),
		list: overrides.list ?? (async () => []),
		pull: async () => {},
		delete: async () => {},
		generate: async () => "",
	} as unknown as OllamaClient;
}

suite("ModelManager — unit", () => {
	test("list: when health fails, every entry is unavailable", async () => {
		const mgr = new ModelManager(makeClient({
			health: async () => ({ ok: false, error: "connection refused" }),
		}));
		const models = await mgr.list();
		assert.ok(models.length > 0, "expected KNOWN_LOCAL_MODELS rows");
		assert.ok(models.every((m) => m.status === "unavailable"));
	});

	test("list: when healthy and model is installed, status is installed", async () => {
		const mgr = new ModelManager(makeClient({
			list: async () => [{ name: "phi3:latest", size: 1, modified: "2024-01-01" }],
		}));
		const models = await mgr.list();
		const phi = models.find((m) => m.tag === "phi3" || m.tag === "phi3:latest");
		assert.ok(phi, "expected phi3 in merged list");
		assert.strictEqual(phi.status, "installed");
	});

	test("list: when healthy and list empty, KNOWN models are not-installed", async () => {
		const mgr = new ModelManager(makeClient({
			list: async () => [],
		}));
		const models = await mgr.list();
		for (const known of KNOWN_LOCAL_MODELS) {
			const row = models.find((m) => m.tag === known || m.displayName === known);
			assert.ok(row, `expected ${known} in list`);
			assert.strictEqual(row.status, "not-installed");
		}
	});

	test("list: no duplicate ids when KNOWN overlaps installed canonical form", async () => {
		const mgr = new ModelManager(makeClient({
			list: async () => [{ name: "phi3:latest", size: 2, modified: "x" }],
		}));
		const models = await mgr.list();
		const ids = models.map((m) => m.id);
		const unique = new Set(ids);
		assert.strictEqual(ids.length, unique.size, `duplicate ids: ${ids.join(", ")}`);
	});

	test("healthProbe: delegates to client.health", async () => {
		let calls = 0;
		const mgr = new ModelManager(makeClient({
			health: async () => {
				calls += 1;
				return { ok: true };
			},
		}));
		const r = await mgr.healthProbe();
		assert.strictEqual(calls, 1);
		assert.strictEqual(r.ok, true);
	});

	test("list: each entry has required string fields and valid status", async () => {
		const mgr = new ModelManager(makeClient({
			list: async () => [{ name: "tinyllama:latest", size: 3, modified: "y" }],
		}));
		const models = await mgr.list();
		assert.ok(models.length > 0);
		for (const m of models) {
			assert.strictEqual(typeof m.id, "string");
			assert.strictEqual(typeof m.displayName, "string");
			assert.strictEqual(typeof m.tag, "string");
			assert.ok(
				m.status === "installed" || m.status === "not-installed" || m.status === "unavailable",
			);
		}
	});
});
