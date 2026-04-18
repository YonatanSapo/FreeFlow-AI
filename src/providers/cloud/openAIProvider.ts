import { ModelProvider, ProviderType, StreamHandler } from "../modelProvider";

export const OPENAI_ID = "cloud:openai";

/**
 * Stub implementation. Holds an optional API key so the UI can wire up
 * SecretStorage and validate presence, but every network-bound method
 * throws "Not implemented" until a real implementation lands.
 */
export class OpenAIProvider implements ModelProvider {
	public readonly id = OPENAI_ID;
	public readonly displayName = "GPT (OpenAI)";
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
