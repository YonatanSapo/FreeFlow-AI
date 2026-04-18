import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ModelRegistry } from "../services/modelRegistry";
import { OllamaService } from "../services/ollamaService";
import { SecretsService, CloudProviderId } from "../services/secretsService";
import { OLLAMA_ID_PREFIX } from "../providers/ollamaProvider";
import { GEMINI_ID, OPENAI_ID, PERPLEXITY_ID } from "../providers/cloud";
import { Logger } from "../services/logger";
import type { ExtToModels, ModelsToExt } from "./webview/shared/messages";

const CLOUD_IDS = new Set<string>([OPENAI_ID, GEMINI_ID, PERPLEXITY_ID]);

export class ModelsViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "promptrouter.models";

	private view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly registry: ModelRegistry,
		private readonly ollama: OllamaService,
		private readonly secrets: SecretsService,
		private readonly logger: Logger,
	) {
		this.registry.onDidChange(() => {
			void this.pushModels();
		});
	}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview")],
		};
		webviewView.webview.html = this.renderHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage((msg: ModelsToExt) => {
			this.handleMessage(msg).catch((err) => {
				this.logger.error("models.handleMessage", err);
			});
		});
	}

	private async handleMessage(msg: ModelsToExt): Promise<void> {
		switch (msg.type) {
			case "ready":
			case "refresh":
				await this.registry.refresh();
				await this.pushModels();
				return;
			case "install":
				await this.installModel(msg.tag);
				return;
			case "remove":
				await this.removeModel(msg.tag);
				return;
			case "setKey":
				await this.setKey(msg.modelId);
				return;
			case "clearKey":
				await this.clearKey(msg.modelId);
				return;
		}
	}

	public async installModel(tag: string): Promise<void> {
		if (!this.view) {
			return;
		}
		const modelId = `${OLLAMA_ID_PREFIX}${tag}`;
		try {
			await this.ollama.pull(tag, (progress) => {
				this.post({
					type: "pullProgress",
					modelId,
					status: progress.status,
					completed: progress.completed,
					total: progress.total,
				});
			});
			this.post({ type: "pullDone", modelId });
			await this.registry.refresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`models.install tag=${tag}`, err);
			this.post({ type: "pullError", modelId, message });
			void vscode.window.showErrorMessage(`PromptRouter: ${message}`);
		}
	}

	public async removeModel(tag: string): Promise<void> {
		try {
			await this.ollama.delete(tag);
			this.post({ type: "info", message: `Removed ${tag}` });
			await this.registry.refresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`models.remove tag=${tag}`, err);
			this.post({ type: "error", message });
			void vscode.window.showErrorMessage(`PromptRouter: ${message}`);
		}
	}

	public async setKey(modelId: string): Promise<void> {
		if (!CLOUD_IDS.has(modelId)) {
			this.post({ type: "error", message: `Not a cloud provider: ${modelId}` });
			return;
		}
		const provider = modelId as CloudProviderId;
		const value = await vscode.window.showInputBox({
			title: `Set API key for ${this.cloudLabel(provider)}`,
			password: true,
			ignoreFocusOut: true,
			placeHolder: "paste API key",
		});
		if (value === undefined) {
			return;
		}
		if (value.length === 0) {
			await this.secrets.clear(provider);
			this.post({ type: "info", message: `Cleared key for ${this.cloudLabel(provider)}` });
		} else {
			await this.secrets.set(provider, value);
			this.post({ type: "info", message: `Stored key for ${this.cloudLabel(provider)}` });
		}
	}

	public async clearKey(modelId: string): Promise<void> {
		if (!CLOUD_IDS.has(modelId)) {
			return;
		}
		await this.secrets.clear(modelId as CloudProviderId);
		this.post({ type: "info", message: `Cleared key for ${this.cloudLabel(modelId as CloudProviderId)}` });
	}

	private cloudLabel(id: CloudProviderId): string {
		switch (id) {
			case OPENAI_ID:
				return "GPT (OpenAI)";
			case GEMINI_ID:
				return "Gemini (Google)";
			case PERPLEXITY_ID:
				return "Perplexity (Search AI)";
		}
	}

	private async pushModels(): Promise<void> {
		if (!this.view) {
			return;
		}
		const list = await this.registry.list();
		this.post({
			type: "models",
			list,
			health: { reachable: this.registry.isOllamaReachable(), platform: process.platform },
		});
	}

	private post(message: ExtToModels): void {
		this.view?.webview.postMessage(message);
	}

	private renderHtml(webview: vscode.Webview): string {
		const root = vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "models");
		const htmlPath = path.join(root.fsPath, "models.html");
		const template = fs.readFileSync(htmlPath, "utf8");
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "models.js"));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "models.css"));
		const nonce = createNonce();
		return template
			.replace(/{{cspSource}}/g, webview.cspSource)
			.replace(/{{nonce}}/g, nonce)
			.replace(/{{scriptUri}}/g, scriptUri.toString())
			.replace(/{{styleUri}}/g, styleUri.toString());
	}
}

function createNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
