import * as vscode from "vscode";
import { ModelProvider, ProviderType } from "../providers/modelProvider";
import { OllamaProvider, OLLAMA_ID_PREFIX, ollamaModelId } from "../providers/ollamaProvider";
import {
	GeminiProvider,
	OpenAIProvider,
	PerplexityProvider,
	GEMINI_ID,
	OPENAI_ID,
	PERPLEXITY_ID,
} from "../providers/cloud";
import { OllamaService, canonicalOllamaTag } from "./ollamaService";
import { SecretsService, CloudProviderId } from "./secretsService";

export type ModelStatus = "running" | "not-installed" | "unavailable";

export interface ModelInfo {
	readonly id: string;
	readonly displayName: string;
	readonly type: ProviderType;
	readonly status: ModelStatus;
	readonly tag?: string;
}

/**
 * Static list of Ollama model tags highlighted in the master prompt.
 * Users can pull others via the UI — those appear alongside these.
 */
export const KNOWN_LOCAL_MODELS: readonly string[] = [
	"llama3.2:3b",
	"qwen2.5",
	"deepseek-r1",
	"phi3",
];

const CLOUD_ORDER: readonly CloudProviderId[] = [OPENAI_ID, GEMINI_ID, PERPLEXITY_ID];

export class ModelRegistry {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	public readonly onDidChange = this._onDidChange.event;

	private installedTags: string[] = [];
	private ollamaReachable = false;
	private ollamaLastError: string | undefined;

	constructor(
		private readonly ollama: OllamaService,
		private readonly secrets: SecretsService,
	) {
		this.secrets.onDidChange(() => this._onDidChange.fire());
	}

	public async refresh(): Promise<void> {
		const probe = await this.ollama.healthProbe();
		this.ollamaReachable = probe.ok;
		this.ollamaLastError = probe.error;
		if (this.ollamaReachable) {
			try {
				const tags = await this.ollama.listModels();
				// Canonicalize so "phi3:latest" from /api/tags matches KNOWN_LOCAL_MODELS entry "phi3".
				this.installedTags = tags.map((t) => canonicalOllamaTag(t.name));
			} catch (err) {
				this.installedTags = [];
				this.ollamaLastError = err instanceof Error ? err.message : String(err);
			}
		} else {
			this.installedTags = [];
		}
		this._onDidChange.fire();
	}

	public isOllamaReachable(): boolean {
		return this.ollamaReachable;
	}

	public getOllamaLastError(): string | undefined {
		return this.ollamaLastError;
	}

	public async list(): Promise<ModelInfo[]> {
		const localTags = this.mergeLocalTags();
		const local: ModelInfo[] = localTags.map((tag) => ({
			id: ollamaModelId(tag),
			displayName: tag,
			type: "local" as ProviderType,
			status: this.localStatus(tag),
			tag,
		}));

		const cloud: ModelInfo[] = [];
		for (const id of CLOUD_ORDER) {
			cloud.push({
				id,
				displayName: this.cloudDisplayName(id),
				type: "cloud",
				status: (await this.secrets.has(id)) ? "not-installed" : "unavailable",
			});
		}

		return [...local, ...cloud];
	}

	public async resolve(id: string): Promise<ModelProvider> {
		if (id.startsWith(OLLAMA_ID_PREFIX)) {
			const tag = id.slice(OLLAMA_ID_PREFIX.length);
			return new OllamaProvider(tag, this.ollama);
		}
		if (id === OPENAI_ID) {
			return new OpenAIProvider(await this.secrets.get(OPENAI_ID));
		}
		if (id === GEMINI_ID) {
			return new GeminiProvider(await this.secrets.get(GEMINI_ID));
		}
		if (id === PERPLEXITY_ID) {
			return new PerplexityProvider(await this.secrets.get(PERPLEXITY_ID));
		}
		throw new Error(`Unknown model id: ${id}`);
	}

	public dispose(): void {
		this._onDidChange.dispose();
	}

	private mergeLocalTags(): string[] {
		// Deduplicate by canonical form: a KNOWN_LOCAL_MODELS entry "phi3" and
		// an installed tag "phi3:latest" share canonical "phi3:latest", so we
		// keep the known short name (first seen wins) and suppress the raw
		// installed duplicate.
		const canonicalToTag = new Map<string, string>();
		for (const tag of KNOWN_LOCAL_MODELS) {
			const c = canonicalOllamaTag(tag);
			if (!canonicalToTag.has(c)) {
				canonicalToTag.set(c, tag);
			}
		}
		for (const tag of this.installedTags) {
			// installedTags are already canonicalized in refresh()
			if (!canonicalToTag.has(tag)) {
				canonicalToTag.set(tag, tag);
			}
		}
		return Array.from(canonicalToTag.values());
	}

	private localStatus(tag: string): ModelStatus {
		if (!this.ollamaReachable) {
			return "unavailable";
		}
		// installedTags are canonical; compare against the canonical form of tag.
		return this.installedTags.includes(canonicalOllamaTag(tag)) ? "running" : "not-installed";
	}

	private cloudDisplayName(id: CloudProviderId): string {
		switch (id) {
			case OPENAI_ID:
				return "GPT (OpenAI)";
			case GEMINI_ID:
				return "Gemini (Google)";
			case PERPLEXITY_ID:
				return "Perplexity (Search AI)";
		}
	}
}
