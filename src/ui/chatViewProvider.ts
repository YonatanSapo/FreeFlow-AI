import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ModelRegistry } from "../services/modelRegistry";
import { Router } from "../services/router";
import { Logger } from "../services/logger";
import type { ChatToExt, ExtToChat } from "./webview/shared/messages";

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "promptrouter.chat";

	private view?: vscode.WebviewView;
	private readonly inFlight = new Map<string, AbortController>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly registry: ModelRegistry,
		private readonly router: Router,
		public readonly logger: Logger,
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

		webviewView.webview.onDidReceiveMessage((msg: ChatToExt) => {
			this.handleMessage(msg).catch((err) => {
				this.logger.error("chat.handleMessage", err);
			});
		});
	}

	private async handleMessage(msg: ChatToExt): Promise<void> {
		switch (msg.type) {
			case "ready":
			case "refresh": {
				const label = msg.type;
				this.logger.show();
				this.logger.info(`chat ${label}: start`);
				try {
					await this.refreshWithTimeout(12_000, label);
				} finally {
					this.logger.info(`chat ${label}: done`);
				}
				return;
			}
			case "cancel": {
				const controller = this.inFlight.get(msg.id);
				if (controller) {
					controller.abort();
					this.inFlight.delete(msg.id);
				}
				return;
			}
			case "prompt":
				await this.handlePrompt(msg.id, msg.modelId, msg.text);
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
			this.registry.refresh().then(() => this.pushModels()),
			timeout,
		]);

		if (timedOut) {
			this.logger.warn(`chat ${label}: registry.refresh timed out after ${timeoutMs / 1000}s`);
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

	private async handlePrompt(id: string, modelId: string, text: string): Promise<void> {
		const controller = new AbortController();
		this.inFlight.set(id, controller);
		try {
			const provider = await this.router.resolve(modelId);
			await provider.sendPrompt(text, (chunk) => {
				if (controller.signal.aborted) {
					return;
				}
				if (chunk.content) {
					this.post({ type: "chunk", id, delta: chunk.content });
				}
			});
			this.post({ type: "done", id });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`chat.prompt modelId=${modelId}`, err);
			this.post({ type: "error", id, message });
		} finally {
			this.inFlight.delete(id);
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

	private post(message: ExtToChat): void {
		if (!this.view) {
			this.logger.warn(`chat: dropping ${message.type} — webview not yet resolved`);
			return;
		}
		this.view.webview.postMessage(message).then(
			(ok) => {
				if (!ok) {
					this.logger.warn(`chat: postMessage(${message.type}) returned false — panel may be hidden`);
				}
			},
			(err) => {
				this.logger.error(`chat: postMessage(${message.type}) rejected`, err);
			},
		);
	}

	private renderHtml(webview: vscode.Webview): string {
		const root = vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "chat");
		const htmlPath = path.join(root.fsPath, "chat.html");
		const template = fs.readFileSync(htmlPath, "utf8");
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "chat.js"));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(root, "chat.css"));
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
