import { ModelProvider, ProviderType, StreamHandler } from "../modelProvider";

export const PERPLEXITY_ID = "cloud:perplexity";

export class PerplexityProvider implements ModelProvider {
	public readonly id = PERPLEXITY_ID;
	public readonly displayName = "Perplexity (Search AI)";
	public readonly type: ProviderType = "cloud";

	constructor(private readonly apiKey?: string) {}

	public hasKey(): boolean {
		return Boolean(this.apiKey && this.apiKey.length > 0);
	}

	public async sendPrompt(_prompt: string, _onChunk?: StreamHandler): Promise<string> {
		throw new Error(`${this.displayName}: Not implemented`);
	}

	public async isAvailable(): Promise<boolean> {
		return false;
	}
}
