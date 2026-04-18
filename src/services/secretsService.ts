import * as vscode from "vscode";
import { GEMINI_ID, OPENAI_ID, PERPLEXITY_ID } from "../providers/cloud";

export type CloudProviderId = typeof OPENAI_ID | typeof GEMINI_ID | typeof PERPLEXITY_ID;

const SECRET_KEY_BY_PROVIDER: Record<CloudProviderId, string> = {
	[OPENAI_ID]: "promptrouter.openai",
	[GEMINI_ID]: "promptrouter.gemini",
	[PERPLEXITY_ID]: "promptrouter.perplexity",
};

/**
 * Typed wrapper around vscode.SecretStorage for the three supported
 * cloud providers. Emits a change event whenever a key is stored or
 * deleted so the model manager UI can refresh its dots.
 */
export class SecretsService {
	private readonly _onDidChange = new vscode.EventEmitter<CloudProviderId>();
	public readonly onDidChange = this._onDidChange.event;

	constructor(private readonly secrets: vscode.SecretStorage) {}

	public async get(provider: CloudProviderId): Promise<string | undefined> {
		return this.secrets.get(SECRET_KEY_BY_PROVIDER[provider]);
	}

	public async set(provider: CloudProviderId, value: string): Promise<void> {
		await this.secrets.store(SECRET_KEY_BY_PROVIDER[provider], value);
		this._onDidChange.fire(provider);
	}

	public async clear(provider: CloudProviderId): Promise<void> {
		await this.secrets.delete(SECRET_KEY_BY_PROVIDER[provider]);
		this._onDidChange.fire(provider);
	}

	public async has(provider: CloudProviderId): Promise<boolean> {
		const value = await this.get(provider);
		return Boolean(value && value.length > 0);
	}

	public dispose(): void {
		this._onDidChange.dispose();
	}
}
