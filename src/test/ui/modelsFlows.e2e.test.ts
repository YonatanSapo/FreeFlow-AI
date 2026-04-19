/**
 * Extension-host e2e tests for Ollama health, install, remove and full flow.
 *
 * All tests run inside the @vscode/test-electron host (npm test).
 * They use a stubbed `fetch` via `routedFetch` so no live Ollama daemon
 * is needed.  One optional live-smoke test is gated on RUN_LIVE_OLLAMA=1.
 */
import * as assert from "assert";
import { ModelRegistry } from "../../services/modelRegistry";
import { OllamaService, DEFAULT_OLLAMA_BASE_URL } from "../../services/ollamaService";
import { Logger } from "../../services/logger";
import { ModelsViewProvider } from "../../ui/modelsViewProvider";
import { ChatViewProvider } from "../../ui/chatViewProvider";
import { Router } from "../../services/router";
import { ollamaModelId } from "../../providers/ollamaProvider";
import {
	fakeWebviewView,
	fakeChatWebviewView,
	getExtensionRoot,
	makeExtensionContext,
	makeSecrets,
	modelsFrames,
	chatModelsFrames,
	waitForEndRefresh,
	waitUntil,
	routedFetch,
	ndjsonResponse,
	jsonResponse,
} from "./helpers";
import type { ExtToModels } from "../../ui/webview/shared/messages";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const PHI3_TAG = { name: "phi3", size: 1_000_000, modified_at: "2024-01-01T00:00:00Z" };

// Real Ollama >= 0.3 format: layer-download events use digest/total/completed with NO status field.
const PHI3_PULL_STREAM = [
	{ status: "pulling manifest" },
	{ digest: "sha256:abc123def456", total: 100, completed: 50 },
	{ digest: "sha256:abc123def456", total: 100, completed: 100 },
	{ status: "verifying sha256 digest" },
	{ status: "writing manifest" },
	{ status: "success" },
];

const PHI3_GENERATE_STREAM = [
	{ response: "he", done: false },
	{ response: "y ", done: false },
	{ response: "back", done: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let logId = 0;
function makeLogger(): Logger {
	return new Logger(`PromptRouter-flows-e2e-${logId++}`);
}

function pullProgressFrames(
	posted: ExtToModels[],
): Array<Extract<ExtToModels, { type: "pullProgress" }>> {
	return posted.filter(
		(m): m is Extract<ExtToModels, { type: "pullProgress" }> => m.type === "pullProgress",
	);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite("Ollama flows (extension-host e2e)", () => {
	// -----------------------------------------------------------------------
	// Health: served
	// -----------------------------------------------------------------------
	test("health served: /api/tags 200 -> reachable true, no lastError", async () => {
		const extensionRoot = getExtensionRoot();
		const { fn } = routedFetch({
			"/api/tags": () => jsonResponse({ models: [] }),
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			const frames = modelsFrames(posted);
			assert.ok(frames.length >= 1, "expected at least one models frame");
			const last = frames[frames.length - 1];
			assert.strictEqual(last.health.reachable, true, "expected reachable=true");
			assert.strictEqual(last.health.lastError, undefined, "expected no lastError");
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Health: unserved
	// -----------------------------------------------------------------------
	test("health unserved: ECONNREFUSED -> lastError mentions Connection refused and ollama serve", async () => {
		const extensionRoot = getExtensionRoot();
		const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
		const { fn } = routedFetch({
			"/api/tags": () => {
				throw new TypeError("fetch failed", { cause });
			},
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			const frames = modelsFrames(posted);
			assert.ok(frames.length >= 1);
			const last = frames[frames.length - 1];
			assert.strictEqual(last.health.reachable, false);
			assert.ok(
				last.health.lastError?.includes("Connection refused"),
				`lastError should mention Connection refused, got: ${last.health.lastError}`,
			);
			assert.ok(
				last.health.lastError?.includes("ollama serve"),
				`lastError should mention ollama serve, got: ${last.health.lastError}`,
			);
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Install: happy path
	// -----------------------------------------------------------------------
	test("install phi-3: pullProgress events, pullDone, models frame shows phi-3 running", async () => {
		const extensionRoot = getExtensionRoot();
		let pullIssued = false;

		const { fn, calls } = routedFetch({
			"/api/tags": () => {
				if (pullIssued) {
					return jsonResponse({ models: [PHI3_TAG] });
				}
				return jsonResponse({ models: [] });
			},
			"/api/pull": () => {
				// Mark before returning — by the time the stream is consumed and
				// registry.refresh() is triggered, /api/tags must return phi-3.
				pullIssued = true;
				return ndjsonResponse(PHI3_PULL_STREAM);
			},
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			// Sanity: initially phi-3 not installed (reachable, but not in list)
			const initialFrame = modelsFrames(posted).at(-1)!;
			assert.strictEqual(initialFrame.health.reachable, true);
			const phi3Before = initialFrame.list.find((m) => m.id === ollamaModelId("phi3"));
			assert.strictEqual(phi3Before?.status, "not-installed", "phi3 should start as not-installed");

			// Trigger install; pullIssued is set inside the /api/pull handler so
			// that the subsequent registry.refresh() already sees phi3 in /api/tags.
			receive({ type: "install", tag: "phi3" });
			await waitUntil(
				() => posted.some((p) => p.type === "pullDone"),
				15_000,
				"waiting for pullDone",
			);

			// Wait for the post-install models frame (registry.refresh() inside installModel)
			await waitUntil(
				() => {
					const frames = modelsFrames(posted);
					return frames.some((f) => f.list.some((m) => m.id === ollamaModelId("phi3") && m.status === "running"));
				},
				10_000,
				"waiting for phi3 running in models frame after install",
			);

			// Assert pullProgress events
			const progressEvents = pullProgressFrames(posted);
			assert.ok(progressEvents.length >= 2, `expected >=2 pullProgress events, got ${progressEvents.length}`);
			assert.ok(
				progressEvents.every((p) => p.modelId === ollamaModelId("phi3")),
				"all pullProgress should have modelId ollama:phi3",
			);
			// Layer-download events have no status; they carry completed/total from the digest line.
			const downloadEvent = progressEvents.find((p) => p.completed !== undefined && p.total !== undefined);
			assert.ok(downloadEvent, "expected at least one progress event with completed/total");

			// Assert pullDone
			const doneFrame = posted.find((p) => p.type === "pullDone") as Extract<
				ExtToModels,
				{ type: "pullDone" }
			>;
			assert.ok(doneFrame, "expected pullDone");
			assert.strictEqual(doneFrame.modelId, ollamaModelId("phi3"));

			// Assert POST /api/pull body
			const pullCall = calls.find((c) => c.url.includes("/api/pull") && c.method === "POST");
			assert.ok(pullCall, "expected a POST to /api/pull");
			assert.deepStrictEqual(pullCall.body, { name: "phi3", stream: true });

			// Assert final models frame has phi3 running
			const frames = modelsFrames(posted);
			const lastFrame = frames.at(-1)!;
			const phi3After = lastFrame.list.find((m) => m.id === ollamaModelId("phi3"));
			assert.strictEqual(phi3After?.status, "running", "phi3 should be running after install");
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Install: error path
	// -----------------------------------------------------------------------
	test("install phi-3 (pull error): pullError posted, no pullDone", async () => {
		const extensionRoot = getExtensionRoot();

		// Stream ends without a success line (real-world Ollama format)
		const { fn } = routedFetch({
			"/api/tags": () => jsonResponse({ models: [] }),
			"/api/pull": () =>
				ndjsonResponse([
					{ status: "pulling manifest" },
					{ digest: "sha256:abc123def456", total: 100, completed: 50 },
					// NO {status: "success"} — pull will fail with "did not complete"
				]),
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			receive({ type: "install", tag: "phi3" });
			await waitUntil(
				() => posted.some((p) => p.type === "pullError"),
				15_000,
				"waiting for pullError",
			);

			const errFrame = posted.find((p) => p.type === "pullError") as Extract<
				ExtToModels,
				{ type: "pullError" }
			>;
			assert.ok(errFrame, "expected pullError message");
			assert.ok(errFrame.message.length > 0, "pullError should have a non-empty message");
			assert.strictEqual(errFrame.modelId, ollamaModelId("phi3"));

			// pullDone must NOT have been posted
			assert.ok(
				!posted.some((p) => p.type === "pullDone"),
				"pullDone must not be posted on pull error",
			);
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Remove
	// -----------------------------------------------------------------------
	test("remove phi3: DELETE issued, info posted, models frame no longer has phi3 running", async () => {
		const extensionRoot = getExtensionRoot();
		let deleted = false;

		const { fn, calls } = routedFetch({
			"/api/tags": () => {
				if (deleted) {
					return jsonResponse({ models: [] });
				}
				return jsonResponse({ models: [PHI3_TAG] });
			},
			"/api/delete": () => {
				deleted = true;
				return jsonResponse({});
			},
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			// Confirm phi3 is running initially
			const initialFrame = modelsFrames(posted).at(-1)!;
			const phi3Before = initialFrame.list.find((m) => m.id === ollamaModelId("phi3"));
			assert.strictEqual(phi3Before?.status, "running", "phi3 should be running before remove");

			posted.length = 0;
			receive({ type: "remove", tag: "phi3" });

			// Wait for info message
			await waitUntil(
				() => posted.some((p) => p.type === "info"),
				10_000,
				"waiting for info after remove",
			);

			// Assert DELETE /api/delete with correct body
			const deleteCall = calls.find((c) => c.url.includes("/api/delete") && c.method === "DELETE");
			assert.ok(deleteCall, "expected a DELETE to /api/delete");
			assert.deepStrictEqual(deleteCall.body, { name: "phi3" });

			// Assert info message includes model name
			const infoFrame = posted.find((p) => p.type === "info") as Extract<
				ExtToModels,
				{ type: "info" }
			>;
			assert.ok(infoFrame.message.includes("phi3"), `info message should mention phi3: ${infoFrame.message}`);

			// Wait for models frame to update
			await waitUntil(
				() => {
					const frames = modelsFrames(posted);
					return frames.some((f) => {
						const phi = f.list.find((m) => m.id === ollamaModelId("phi3"));
						return phi !== undefined && phi.status !== "running";
					});
				},
				10_000,
				"waiting for phi3 to no longer be running after remove",
			);

			const lastFrame = modelsFrames(posted).at(-1)!;
			const phi3After = lastFrame.list.find((m) => m.id === ollamaModelId("phi3"));
			assert.ok(
				phi3After === undefined || phi3After.status !== "running",
				`phi3 should not be running after removal, got status=${phi3After?.status}`,
			);
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Full flow: install then prompt
	// -----------------------------------------------------------------------
	test("full flow: install phi-3 then sendPrompt returns streamed answer", async () => {
		const extensionRoot = getExtensionRoot();
		let pullIssued = false;

		const { fn, calls } = routedFetch({
			"/api/tags": () => {
				if (pullIssued) {
					return jsonResponse({ models: [PHI3_TAG] });
				}
				return jsonResponse({ models: [] });
			},
			"/api/pull": () => {
				pullIssued = true;
				return ndjsonResponse(PHI3_PULL_STREAM);
			},
			"/api/generate": () => ndjsonResponse(PHI3_GENERATE_STREAM),
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			// Trigger install; pullIssued is set inside the route handler
			receive({ type: "install", tag: "phi3" });
			await waitUntil(
				() => posted.some((p) => p.type === "pullDone"),
				15_000,
				"waiting for pullDone",
			);

			// Wait for phi3 to be running in the registry
			await waitUntil(
				() => {
					const frames = modelsFrames(posted);
					return frames.some((f) => f.list.some((m) => m.id === ollamaModelId("phi3") && m.status === "running"));
				},
				10_000,
				"waiting for phi3 running after install",
			);

			// Route a prompt through the Router
			const router = new Router(registry);
			const provider2 = await router.resolve(ollamaModelId("phi3"));
			const chunks: string[] = [];
			const answer = await provider2.sendPrompt("hey", (c) => {
				chunks.push(c.content);
			});

			assert.strictEqual(answer, "hey back", `expected answer "hey back", got "${answer}"`);
			assert.deepStrictEqual(chunks, ["he", "y ", "back"]);

			// Assert POST /api/generate body
			const generateCall = calls.find((c) => c.url.includes("/api/generate") && c.method === "POST");
			assert.ok(generateCall, "expected a POST to /api/generate");
			assert.deepStrictEqual(generateCall.body, { model: "phi3", prompt: "hey", stream: true });
		} finally {
			logger.dispose();
		}
	});
	// -----------------------------------------------------------------------
	// Install: inline stream error
	// -----------------------------------------------------------------------
	test("install phi-3 (stream error event): pullError posted with Ollama message, no pullDone", async () => {
		const extensionRoot = getExtensionRoot();

		const { fn } = routedFetch({
			"/api/tags": () => jsonResponse({ models: [] }),
			"/api/pull": () =>
				ndjsonResponse([
					{ status: "pulling manifest" },
					{ error: "model 'phi3' not found" },
				]),
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			receive({ type: "install", tag: "phi3" });
			await waitUntil(
				() => posted.some((p) => p.type === "pullError"),
				15_000,
				"waiting for pullError from stream error event",
			);

			const errFrame = posted.find((p) => p.type === "pullError") as Extract<
				ExtToModels,
				{ type: "pullError" }
			>;
			assert.ok(errFrame.message.includes("model 'phi3' not found"), `expected Ollama error in message, got: ${errFrame.message}`);
			assert.ok(!posted.some((p) => p.type === "pullDone"), "pullDone must not be posted");
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Real-world tag mismatch: phi3 (known) vs phi3:latest (from /api/tags)
	// -----------------------------------------------------------------------
	test("phi3 shown as running when /api/tags returns phi3:latest (canonical tag match)", async () => {
		const extensionRoot = getExtensionRoot();
		let pullIssued = false;

		// Simulate real Ollama: pulls phi3 but /api/tags returns phi3:latest
		const PHI3_LATEST_TAG = { name: "phi3:latest", size: 2_200_000_000, modified_at: "2025-01-01T00:00:00Z" };

		const { fn } = routedFetch({
			"/api/tags": () => {
				if (pullIssued) {
					return jsonResponse({ models: [PHI3_LATEST_TAG] });
				}
				return jsonResponse({ models: [] });
			},
			"/api/pull": () => {
				pullIssued = true;
				return ndjsonResponse(PHI3_PULL_STREAM);
			},
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			// Trigger install
			receive({ type: "install", tag: "phi3" });
			await waitUntil(
				() => posted.some((p) => p.type === "pullDone"),
				15_000,
				"waiting for pullDone",
			);

			// Wait for models frame after install — phi3 must appear as running
			await waitUntil(
				() => {
					return modelsFrames(posted).some((f) =>
						f.list.some((m) => m.id === ollamaModelId("phi3") && m.status === "running"),
					);
				},
				10_000,
				"waiting for phi3 running after install with phi3:latest in /api/tags",
			);

			const lastFrame = modelsFrames(posted).at(-1)!;
			const phi3 = lastFrame.list.find((m) => m.id === ollamaModelId("phi3"));
			assert.strictEqual(phi3?.status, "running",
				`phi3 should be running even when /api/tags returns phi3:latest, got: ${phi3?.status}`);

			// Must not duplicate as a separate phi3:latest row
			const duplicateRow = lastFrame.list.find((m) => m.id === ollamaModelId("phi3:latest"));
			assert.strictEqual(duplicateRow, undefined,
				"phi3:latest must not appear as a separate row — should be deduped with phi3");
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Refresh hang: /api/tags never resolves -> UI unsticks within 12s
	// -----------------------------------------------------------------------
	test("refresh hang: /api/tags never resolves -> refreshing:false and error models frame within 15s", async () => {
		const extensionRoot = getExtensionRoot();

		// Allow the initial ready to complete normally (2 calls: healthProbe + listModels).
		// Then allow healthProbe during refresh (1 more call).
		// The 4th call (listModels during refresh) hangs forever to trigger the timeout.
		let callCount = 0;
		const fn = (async (input: RequestInfo | URL): Promise<Response> => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
			if (url.includes("/api/tags")) {
				callCount++;
				if (callCount <= 3) {
					// Calls 1-3 return normally so ready + healthProbe-for-refresh complete
					return new Response(JSON.stringify({ models: [] }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				// Call 4+ (listModels during refresh) — hang forever to trigger 12s timeout
				await new Promise<void>(() => {});
			}
			throw new Error(`routedFetch: no handler for ${url}`);
		}) as unknown as typeof fetch;

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const { view, posted, receive } = fakeWebviewView();
		const provider = new ModelsViewProvider(makeExtensionContext(extensionRoot), registry, ollama, secrets, logger);
		try {
			provider.resolveWebviewView(view);
			receive({ type: "ready" });
			await waitForEndRefresh(posted);

			// After initial ready, clear and send a refresh
			posted.length = 0;
			receive({ type: "refresh" });

			// The 12-second timeout in ModelsViewProvider should fire and post refreshing:false + an error models frame
			await waitUntil(
				() => {
					const hasEndRefresh = posted.some((p) => p.type === "refreshing" && !(p as Extract<ExtToModels, {type:"refreshing"}>).on);
					const hasModelsError = modelsFrames(posted).some((f) => !f.health.reachable && !!f.health.lastError);
					return hasEndRefresh && hasModelsError;
				},
				15_000,
				"waiting for refreshing:false + error models frame after hang",
			);

			const errorFrame = modelsFrames(posted).find((f) => !f.health.reachable);
			assert.ok(errorFrame, "expected an error models frame");
			assert.ok(
				errorFrame.health.lastError?.includes("timed out"),
				`expected "timed out" in lastError, got: ${errorFrame.health.lastError}`,
			);
		} finally {
			logger.dispose();
		}
	});

	// -----------------------------------------------------------------------
	// Health: timeout / AbortError path
	// -----------------------------------------------------------------------
	test("healthProbe timeout: fetch that throws AbortError -> ok:false with helpful message", async () => {
		// Simulate what happens when the 8-second AbortController fires: fetch rejects with AbortError.
		const fn = (async (): Promise<Response> => {
			throw new DOMException("The operation was aborted.", "AbortError");
		}) as unknown as typeof fetch;

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const result = await ollama.healthProbe();

		assert.strictEqual(result.ok, false, "expected ok=false on AbortError");
		assert.ok(
			result.error?.includes("timed out") || result.error?.includes("timeout"),
			`expected "timed out" in error message, got: ${result.error}`,
		);
		assert.ok(
			result.error?.includes("ollama serve"),
			`expected "ollama serve" hint in error message, got: ${result.error}`,
		);
	});

	// -----------------------------------------------------------------------
	// ChatViewProvider: refresh button logs and posts models frame
	// -----------------------------------------------------------------------
	test("chat refresh: logs start/done and posts a models frame with reachable=true", async () => {
		const extensionRoot = getExtensionRoot();

		const { fn } = routedFetch({
			"/api/tags": () => jsonResponse({ models: [] }),
		});

		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL, fn);
		const secrets = makeSecrets();
		const registry = new ModelRegistry(ollama, secrets);
		const logger = makeLogger();
		const router = new Router(registry);
		const { view: chatView, posted: chatPosted, receive: chatReceive } = fakeChatWebviewView();
		const chatProvider = new ChatViewProvider(makeExtensionContext(extensionRoot), registry, router, logger);
		try {
			chatProvider.resolveWebviewView(chatView);
			chatReceive({ type: "ready" });

			// Wait for a models frame from the chat provider
			await waitUntil(
				() => chatModelsFrames(chatPosted).length >= 1,
				10_000,
				"waiting for chat models frame on ready",
			);

			// Trigger explicit refresh
			chatPosted.length = 0;
			chatReceive({ type: "refresh" });

			await waitUntil(
				() => chatModelsFrames(chatPosted).length >= 1,
				10_000,
				"waiting for chat models frame on refresh",
			);

			const lastFrame = chatModelsFrames(chatPosted).at(-1)!;
			assert.strictEqual(lastFrame.health.reachable, true,
				"chat models frame should show reachable=true when Ollama is up");
			assert.strictEqual(lastFrame.health.lastError, undefined,
				"no lastError expected when Ollama responds normally");
		} finally {
			logger.dispose();
		}
	});
});

// ---------------------------------------------------------------------------
// Live smoke test (gated on RUN_LIVE_OLLAMA=1)
// ---------------------------------------------------------------------------

suite("Ollama live smoke (RUN_LIVE_OLLAMA=1)", function () {
	this.timeout(30_000);

	test("healthProbe returns ok and listModels returns an array", async function () {
		if (process.env.RUN_LIVE_OLLAMA !== "1") {
			this.skip();
			return;
		}
		const ollama = new OllamaService(DEFAULT_OLLAMA_BASE_URL);
		const probe = await ollama.healthProbe();
		if (!probe.ok) {
			// Daemon not running — skip gracefully rather than fail
			console.log(`[live-smoke] Ollama not reachable: ${probe.error} — skipping`);
			this.skip();
			return;
		}
		const models = await ollama.listModels();
		assert.ok(Array.isArray(models), "listModels should return an array");
		console.log(`[live-smoke] Ollama reachable, ${models.length} model(s) installed`);
	});
});
