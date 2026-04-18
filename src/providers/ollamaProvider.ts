import { ModelProvider, ProviderType, StreamHandler } from "./modelProvider";
import { OllamaService } from "../services/ollamaService";

/**
 * Stable identifier prefix used everywhere in the UI and router for
 * Ollama-backed models. The tag (e.g. "llama3.2:3b") is appended as-is.
 */
export const OLLAMA_ID_PREFIX = "ollama:";

export function ollamaModelId(tag: string): string {
	return `${OLLAMA_ID_PREFIX}${tag}`;
}

export function isOllamaId(id: string): boolean {
	return id.startsWith(OLLAMA_ID_PREFIX);
}

export function ollamaTagFromId(id: string): string {
	if (!isOllamaId(id)) {
		throw new Error(`Not an Ollama model id: ${id}`);
	}
	return id.slice(OLLAMA_ID_PREFIX.length);
}

export class OllamaProvider implements ModelProvider {
	public readonly type: ProviderType = "local";

	constructor(
		public readonly tag: string,
		private readonly service: OllamaService,
	) {}

	public get id(): string {
		return ollamaModelId(this.tag);
	}

	public get displayName(): string {
		return this.tag;
	}

	public async sendPrompt(prompt: string, onChunk?: StreamHandler): Promise<string> {
		return this.service.generate(this.tag, prompt, (token, done) => {
			if (onChunk) {
				onChunk({ content: token, done });
			}
		});
	}

	public async isAvailable(): Promise<boolean> {
		if (!(await this.service.health())) {
			return false;
		}
		try {
			const tags = await this.service.listModels();
			return tags.some((t) => t.name === this.tag);
		} catch {
			return false;
		}
	}
}
