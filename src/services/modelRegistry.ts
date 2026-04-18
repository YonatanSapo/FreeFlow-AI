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
import { OllamaService } from "./ollamaService";
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
	"phi-3",
];

const CLOUD_ORDER: readonly CloudProviderId[] = [OPENAI_ID, GEMINI_ID, PERPLEXITY_ID];

export class ModelRegistry {
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	public readonly onDidChange = this._onDidChange.event;

	private installedTags: string[] = [];
	private ollamaReachable = false;

	constructor(
		private readonly ollama: OllamaService,
		private readonly secrets: SecretsService,
	) {
		this.secrets.onDidChange(() => this._onDidChange.fire());
	}

	public async refresh(): Promise<void> {
		this.ollamaReachable = await this.ollama.health();
		if (this.ollamaReachable) {
			try {
				const tags = await this.ollama.listModels();
				this.installedTags = tags.map((t) => t.name);
			} catch {
				this.installedTags = [];
			}
		} else {
			this.installedTags = [];
		}
		this._onDidChange.fire();
	}

	public isOllamaReachable(): boolean {
		return this.ollamaReachable;
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
		const seen = new Set<string>();
		const merged: string[] = [];
		for (const tag of KNOWN_LOCAL_MODELS) {
			if (!seen.has(tag)) {
				seen.add(tag);
				merged.push(tag);
			}
		}
		for (const tag of this.installedTags) {
			if (!seen.has(tag)) {
				seen.add(tag);
				merged.push(tag);
			}
		}
		return merged;
	}

	private localStatus(tag: string): ModelStatus {
		if (!this.ollamaReachable) {
			return "unavailable";
		}
		return this.installedTags.includes(tag) ? "running" : "not-installed";
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
