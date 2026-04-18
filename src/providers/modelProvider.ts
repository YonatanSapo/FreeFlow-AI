export type ProviderType = "local" | "cloud";

export interface StreamChunk {
	readonly content: string;
	readonly done: boolean;
}

export type StreamHandler = (chunk: StreamChunk) => void;

export interface ModelProvider {
	readonly id: string;
	readonly displayName: string;
	readonly type: ProviderType;
	sendPrompt(prompt: string, onChunk?: StreamHandler): Promise<string>;
	isAvailable(): Promise<boolean>;
}
