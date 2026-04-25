/**
 * Test-support helpers for suites that require a live Ollama daemon.
 *
 * Usage in a Mocha suite:
 *
 *   import { OllamaEnv, TEST_MODEL } from "../support/ollamaEnv";
 *
 *   suite("My suite", () => {
 *     let env: OllamaEnv;
 *
 *     suiteSetup(async function (this: Mocha.Context) {
 *       env = await OllamaEnv.setup(this);
 *     });
 *
 *     test("something", async () => { ... use env.client ... });
 *   });
 */

import { OllamaClient, DEFAULT_OLLAMA_BASE_URL } from "../../core/ollama/client.js";

/** The smallest available Ollama model — used in tests that need a real model. */
export const TEST_MODEL = "qwen2.5:0.5b";

export class OllamaEnv {
	readonly client: OllamaClient;

	private constructor(client: OllamaClient) {
		this.client = client;
	}

	/**
	 * Probe the daemon and return an `OllamaEnv`, or call `ctx.skip()` if
	 * Ollama is not reachable so the whole suite is skipped gracefully.
	 */
	static async setup(ctx: Mocha.Context): Promise<OllamaEnv> {
		const client = new OllamaClient({ baseUrl: DEFAULT_OLLAMA_BASE_URL });
		const probe = await client.health();
		if (!probe.ok) {
			// Prints a clear message in the test output instead of failing.
			console.warn(`[ollamaEnv] Ollama not reachable — skipping suite. (${probe.error ?? "no detail"})`);
			ctx.skip();
			// ctx.skip() throws internally; this line is unreachable at runtime
			// but required to satisfy TypeScript's control-flow analysis.
			throw new Error("unreachable");
		}
		return new OllamaEnv(client);
	}

	/**
	 * Ensure `tag` is installed on the daemon, pulling it if necessary.
	 * After pulling, verifies the model appears in `list()`.  If it does not
	 * (can happen when Ollama finishes writing blobs slightly after the pull
	 * stream reports "success"), this method waits up to 5 s and re-checks.
	 *
	 * Meant to be called in a `suiteSetup` / `before` block.
	 * Idempotent — skips the pull if the model is already present.
	 */
	async ensureModel(tag: string): Promise<void> {
		const installed = await this.client.list();
		const already = installed.some(
			(m) => m.name === tag || m.name === `${tag}:latest`,
		);
		if (already) {
			return;
		}
		console.log(`[ollamaEnv] Pulling ${tag} …`);
		await this.client.pull(tag);

		// Verify the model appears in list() before returning — Ollama can report
		// "success" in the pull stream before its internal registry is updated.
		for (let i = 0; i < 10; i++) {
			const updated = await this.client.list();
			if (updated.some((m) => m.name === tag || m.name === `${tag}:latest`)) {
				console.log(`[ollamaEnv] ${tag} ready.`);
				return;
			}
			await new Promise<void>((resolve) => setTimeout(resolve, 500));
		}
		console.log(`[ollamaEnv] ${tag} ready (post-pull verify timed out, continuing).`);
	}
}
