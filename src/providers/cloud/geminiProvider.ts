import { ModelProvider, ProviderType, StreamHandler } from "../modelProvider";

export const GEMINI_ID = "cloud:gemini";

export class GeminiProvider implements ModelProvider {
	public readonly id = GEMINI_ID;
	public readonly displayName = "Gemini (Google)";
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
