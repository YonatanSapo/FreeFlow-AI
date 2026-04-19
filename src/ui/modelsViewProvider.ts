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
			void this.safePushModels();
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
			case "refresh": {
				const label = msg.type === "refresh" ? "refresh" : "ready";
				this.logger.show();
				this.logger.info(`models ${label}: start`);
				this.post({ type: "refreshing", on: true });
				try {
					await this.refreshWithTimeout(12_000, label);
				} finally {
					this.post({ type: "refreshing", on: false });
					this.logger.info(`models ${label}: done`);
				}
				return;
			}
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

	private async refreshWithTimeout(timeoutMs: number, label: string): Promise<void> {
		let timedOut = false;
		const timeout = new Promise<void>((resolve) => setTimeout(() => {
			timedOut = true;
			resolve();
		}, timeoutMs));

		await Promise.race([
			this.registry.refresh().then(() => this.safePushModels()),
			timeout,
		]);

		if (timedOut) {
			this.logger.warn(`models ${label}: registry.refresh timed out after ${timeoutMs / 1000}s — Ollama may be unresponsive`);
			this.post({
				type: "models",
				list: [],
				health: {
					reachable: false,
					platform: process.platform,
					lastError: `refresh timed out after ${timeoutMs / 1000}s — try running: ollama serve`,
				},
			});
		}
	}

	public async installModel(tag: string): Promise<void> {
		const modelId = `${OLLAMA_ID_PREFIX}${tag}`;
		this.logger.show();
		this.logger.info(`install: requesting pull for ${tag}`);

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Installing Ollama model: ${tag}`,
					cancellable: true,
				},
				async (progress, token) => {
				let lastPct = 0;
				let lastLabel = "";
				await this.ollama.pull(tag, (p) => {
					if (token.isCancellationRequested) {
						return;
					}
					const pct = p.total && p.completed !== undefined
						? Math.round((p.completed / p.total) * 100)
						: undefined;
					const increment = pct !== undefined ? Math.max(0, pct - lastPct) : undefined;
					if (pct !== undefined) {
						lastPct = pct;
					}
					// Newer Ollama omits `status` on layer-download events; fall back to a digest-based label.
					const label = p.status ?? (p.digest ? `downloading ${p.digest.slice(7, 19)}` : "downloading");
					const message = pct !== undefined ? `${label} (${pct}%)` : label;
					progress.report({ message, increment });
					if (label !== lastLabel || pct !== undefined) {
						this.logger.info(`pull ${tag}: ${message}`);
						lastLabel = label;
					}
					this.post({
						type: "pullProgress",
						modelId,
						status: p.status,
						completed: p.completed,
						total: p.total,
					});
				});
					if (token.isCancellationRequested) {
						this.logger.warn(`pull ${tag}: cancel requested (HTTP request continues until Ollama finishes)`);
					}
				},
			);
			this.logger.info(`install: ${tag} complete`);
			this.post({ type: "pullDone", modelId });
			await this.registry.refresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`models.install tag=${tag}`, err);
			this.post({ type: "pullError", modelId, message });
			void vscode.window.showErrorMessage(`PromptRouter: ${message}`);
		} finally {
			// Refresh regardless of success/failure so the models frame reflects current state.
			await this.registry.refresh().catch(() => {});
		}
	}

	public async removeModel(tag: string): Promise<void> {
		this.logger.show();
		this.logger.info(`remove: deleting ${tag}`);
		try {
			await this.ollama.delete(tag);
			this.logger.info(`remove: ${tag} done`);
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
			health: {
				reachable: this.registry.isOllamaReachable(),
				platform: process.platform,
				lastError: this.registry.getOllamaLastError(),
			},
		});
	}

	/** Always push a `models` frame so the webview never stays on "checking…" if list/health fails. */
	private async safePushModels(): Promise<void> {
		try {
			await this.pushModels();
		} catch (err) {
			this.logger.error("pushModels failed", err);
			this.post({
				type: "models",
				list: [],
				health: {
					reachable: false,
					platform: process.platform,
					lastError: err instanceof Error ? err.message : String(err),
				},
			});
		}
	}

	private post(message: ExtToModels): void {
		if (!this.view) {
			this.logger.warn(`models: dropping ${message.type} — webview not yet resolved`);
			return;
		}
		this.view.webview.postMessage(message).then(
			(ok) => {
				if (!ok) {
					this.logger.warn(`models: postMessage(${message.type}) returned false — panel may be hidden`);
				}
			},
			(err) => {
				this.logger.error(`models: postMessage(${message.type}) rejected`, err);
			},
		);
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
