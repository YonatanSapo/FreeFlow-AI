import * as assert from "assert";
import * as vscode from "vscode";
import { ModelRegistry, type ModelInfo } from "../../services/modelRegistry";
import { OllamaService } from "../../services/ollamaService";
import { Logger } from "../../services/logger";
import { ModelsViewProvider } from "../../ui/modelsViewProvider";
import { ollamaModelId } from "../../providers/ollamaProvider";
import {
	fakeWebviewView,
	getExtensionRoot,
	makeExtensionContext,
	makeSecrets,
	modelsFrames,
	waitForEndRefresh,
} from "./helpers";

class BrokenListRegistry extends ModelRegistry {
	async list(): Promise<ModelInfo[]> {
		throw new Error("simulated list failure");
	}
}

suite("ModelsViewProvider (extension-host protocol)", () => {
	let logId = 0;
	function makeLogger(): Logger {
		return new Logger(`PromptRouter-models-e2e-${logId++}`);
	}

	test("ready: posts models with phi-3 running when /api/tags returns phi-3", async () => {
		const extensionRoot = getExtensionRoot();
		const { view, posted, receive } = fakeWebviewView();
		const fetchImpl = (async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: (input as Request).url;
			if (url.includes("/api/tags")) {
				return new Response(JSON.stringify({ models: [{ name: "phi-3", size: 1, modified_at: "2024-01-01" }] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`unexpected fetch ${url}`);
		}) as typeof fetch;

		const ollama = new OllamaService("http://127.0.0.1:11434", fetchImpl);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			const last = posted[posted.length - 1];
			assert.strictEqual(last.type, "refreshing");
			assert.strictEqual(last.on, false);

			const frames = modelsFrames(posted);
			assert.ok(frames.length >= 1, "expected at least one models frame");
			const lastModels = frames[frames.length - 1];
			assert.strictEqual(lastModels.health.reachable, true);
			// /api/tags returns "phi-3"; after canonicalization it becomes "phi-3:latest"
			const phi = lastModels.list.find((m) => m.id === ollamaModelId("phi-3:latest"));
			assert.ok(phi, "phi-3 should appear in list (canonicalized to phi-3:latest)");
			assert.strictEqual(phi?.status, "running");
		} finally {
			logger.dispose();
		}
	});

	test("ready: posts models unreachable when fetch fails (ECONNREFUSED)", async () => {
		const extensionRoot = getExtensionRoot();
		const { view, posted, receive } = fakeWebviewView();
		const cause = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
		const fetchImpl = (async () => {
			throw new TypeError("fetch failed", { cause });
		}) as typeof fetch;

		const ollama = new OllamaService("http://127.0.0.1:11434", fetchImpl);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			const frames = modelsFrames(posted);
			assert.ok(frames.length >= 1);
			const lastModels = frames[frames.length - 1];
			assert.strictEqual(lastModels.health.reachable, false);
			assert.ok(
				lastModels.health.lastError?.includes("Cannot reach Ollama"),
				`expected Cannot reach Ollama in lastError, got ${lastModels.health.lastError}`,
			);
		} finally {
			logger.dispose();
		}
	});

	test("ready: safePushModels emits fallback models when list() throws", async () => {
		const extensionRoot = getExtensionRoot();
		const { view, posted, receive } = fakeWebviewView();
		const fetchImpl = (async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: (input as Request).url;
			if (url.includes("/api/tags")) {
				return new Response(JSON.stringify({ models: [] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}
			throw new Error(`unexpected fetch ${url}`);
		}) as typeof fetch;

		const ollama = new OllamaService("http://127.0.0.1:11434", fetchImpl);
		const secrets = makeSecrets();
		const registry = new BrokenListRegistry(ollama, secrets);
		const logger = makeLogger();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			const frames = modelsFrames(posted);
			assert.ok(frames.length >= 1);
			const fallback = frames.find((f) => f.list.length === 0 && f.health.reachable === false);
			assert.ok(fallback, "expected a fallback models frame with empty list");
			assert.ok(
				fallback?.health.lastError?.includes("simulated list failure"),
				`expected simulated list failure, got ${fallback?.health.lastError}`,
			);
		} finally {
			logger.dispose();
		}
	});

	test("refresh: after ok, failing fetch yields unreachable models", async () => {
		const extensionRoot = getExtensionRoot();
		const { view, posted, receive } = fakeWebviewView();
		const state = { failTags: false };
		const fetchImpl = (async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: (input as Request).url;
			if (!url.includes("/api/tags")) {
				throw new Error(`unexpected fetch ${url}`);
			}
			if (state.failTags) {
				const cause = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
				throw new TypeError("fetch failed", { cause });
			}
			return new Response(JSON.stringify({ models: [{ name: "phi-3", size: 1, modified_at: "2024-01-01" }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const ollama = new OllamaService("http://127.0.0.1:11434", fetchImpl);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);
			assert.strictEqual(modelsFrames(posted).at(-1)?.health.reachable, true);

			state.failTags = true;
			posted.length = 0;
			receive({ type: "refresh" });
			await waitForEndRefresh(posted);

			const lastModels = modelsFrames(posted).at(-1);
			assert.strictEqual(lastModels?.health.reachable, false);
			assert.ok(lastModels?.health.lastError?.includes("Cannot reach Ollama"));
		} finally {
			logger.dispose();
		}
	});
});
