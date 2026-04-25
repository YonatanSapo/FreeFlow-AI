import { OllamaClient } from "../ollama/client.js";
import { canonicalTag, ollamaModelId } from "../ollama/tags.js";
import type { PullProgressHandler } from "../ollama/types.js";

export type ModelStatus = "installed" | "not-installed" | "unavailable";

export interface ModelInfo {
	readonly id: string;
	readonly displayName: string;
	readonly tag: string;
	readonly status: ModelStatus;
}

/**
 * Curated set of popular Ollama model tags shown even before the user has
 * pulled them. Users can also pull arbitrary tags via the UI.
 */
export const KNOWN_LOCAL_MODELS: readonly string[] = [
	"llama3.2:3b",
	"qwen2.5",
	"deepseek-r1",
	"phi3",
];

export class ModelManager {
	constructor(private readonly client: OllamaClient) {}

	/**
	 * Return the merged model list.
	 * When Ollama is unreachable, all entries have `status: "unavailable"`.
	 * When reachable, installed models show `"installed"`, others `"not-installed"`.
	 */
	public async list(): Promise<ModelInfo[]> {
		const probe = await this.client.health();

		if (!probe.ok) {
			return KNOWN_LOCAL_MODELS.map((tag) => ({
				id: ollamaModelId(tag),
				displayName: tag,
				tag,
				status: "unavailable" as ModelStatus,
			}));
		}

		const installed = await this.client.list();
		const installedCanonical = new Set(installed.map((t) => canonicalTag(t.name)));

		// Merge KNOWN_LOCAL_MODELS and installed tags, deduplicating by canonical form.
		// The first occurrence of a canonical tag wins (so "phi3" beats "phi3:latest").
		const canonToDisplay = new Map<string, string>();
		for (const tag of KNOWN_LOCAL_MODELS) {
			const c = canonicalTag(tag);
			if (!canonToDisplay.has(c)) {
				canonToDisplay.set(c, tag);
			}
		}
		for (const t of installed) {
			const c = canonicalTag(t.name);
			if (!canonToDisplay.has(c)) {
				canonToDisplay.set(c, t.name);
			}
		}

		return Array.from(canonToDisplay.entries()).map(([canonical, displayTag]) => ({
			id: ollamaModelId(displayTag),
			displayName: displayTag,
			tag: displayTag,
			status: installedCanonical.has(canonical) ? "installed" : "not-installed",
		}));
	}

	/** Pull (install) a model. Streams progress to `onProgress` if provided. */
	public async install(tag: string, onProgress?: PullProgressHandler): Promise<void> {
		await this.client.pull(tag, onProgress);
	}

	/** Delete a locally installed model. */
	public async remove(tag: string): Promise<void> {
		await this.client.delete(tag);
	}

	/** Forward the Ollama health probe so callers don't need a raw OllamaClient. */
	public async healthProbe(): Promise<{ ok: boolean; error?: string }> {
		return this.client.health();
	}
}
