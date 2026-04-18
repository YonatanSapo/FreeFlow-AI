import * as assert from "assert";
import * as vscode from "vscode";
import { ModelRegistry } from "../../services/modelRegistry";
import { Router } from "../../services/router";
import { OllamaService } from "../../services/ollamaService";
import { SecretsService } from "../../services/secretsService";
import { OllamaProvider } from "../../providers/ollamaProvider";
import {
	OpenAIProvider,
	GeminiProvider,
	PerplexityProvider,
	OPENAI_ID,
	GEMINI_ID,
	PERPLEXITY_ID,
} from "../../providers/cloud";

function makeSecrets(): SecretsService {
	const map = new Map<string, string>();
	const store: vscode.SecretStorage = {
		get: async (k) => map.get(k),
		store: async (k, v) => {
			map.set(k, v);
		},
		delete: async (k) => {
			map.delete(k);
		},
		keys: async () => Array.from(map.keys()),
		onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
	};
	return new SecretsService(store);
}

function makeRegistry(): { registry: ModelRegistry; router: Router } {
	const throwingFetch = (async () => {
		throw new Error("offline");
	}) as unknown as typeof fetch;
	const ollama = new OllamaService("http://localhost:11434", throwingFetch);
	const registry = new ModelRegistry(ollama, makeSecrets());
	return { registry, router: new Router(registry) };
}

suite("Router / ModelRegistry.resolve", () => {
	test("resolves ollama: ids to an OllamaProvider with the right tag", async () => {
		const { router } = makeRegistry();
		const provider = await router.resolve("ollama:llama3.2:3b");
		assert.ok(provider instanceof OllamaProvider);
		assert.strictEqual(provider.displayName, "llama3.2:3b");
		assert.strictEqual(provider.type, "local");
	});

	test("resolves cloud:openai to OpenAIProvider", async () => {
		const { router } = makeRegistry();
		const provider = await router.resolve(OPENAI_ID);
		assert.ok(provider instanceof OpenAIProvider);
	});

	test("resolves cloud:gemini to GeminiProvider", async () => {
		const { router } = makeRegistry();
		const provider = await router.resolve(GEMINI_ID);
		assert.ok(provider instanceof GeminiProvider);
	});

	test("resolves cloud:perplexity to PerplexityProvider", async () => {
		const { router } = makeRegistry();
		const provider = await router.resolve(PERPLEXITY_ID);
		assert.ok(provider instanceof PerplexityProvider);
	});

	test("throws on unknown id", async () => {
		const { router } = makeRegistry();
		await assert.rejects(() => router.resolve("not-a-real-id"), /Unknown model id/);
	});

	test("list() reports unavailable for local models when Ollama is offline", async () => {
		const { registry } = makeRegistry();
		await registry.refresh();
		const list = await registry.list();
		const local = list.filter((m) => m.type === "local");
		assert.ok(local.length > 0);
		assert.ok(local.every((m) => m.status === "unavailable"));
	});
});
