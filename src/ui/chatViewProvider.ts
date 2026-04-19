import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ChatManager } from "../core/chat/manager.js";
import { ModelManager } from "../core/models/manager.js";
import { VSCodeLogger } from "../adapters/vscodeLogger.js";
import type { ChatToExt, ExtToChat } from "./webview/shared/messages.js";

export class ChatViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "promptrouter.chat";

	private view?: vscode.WebviewView;
	/** Maps in-flight request id → AbortController so Cancel works. */
	private readonly inFlight = new Map<string, AbortController>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly chatManager: ChatManager,
		private readonly modelManager: ModelManager,
		private readonly logger: VSCodeLogger,
	) {}

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
			case "refresh":
				this.logger.show();
				this.logger.info(`chat ${msg.type}: start`);
				await this.pushModels();
				this.logger.info(`chat ${msg.type}: done`);
				return;

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

	private async handlePrompt(id: string, modelId: string, text: string): Promise<void> {
		const controller = new AbortController();
		this.inFlight.set(id, controller);

		// Create a disposable chat session scoped to this single prompt.
		const session = this.chatManager.createChat(modelId);
		try {
			await session.sendPrompt(text, (token) => {
				if (controller.signal.aborted) {
					return;
				}
				if (token) {
					this.post({ type: "chunk", id, delta: token });
				}
			});
			this.post({ type: "done", id });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`chat.prompt modelId=${modelId}`, err);
			this.post({ type: "error", id, message });
		} finally {
			session.close();
			this.inFlight.delete(id);
		}
	}

	private async pushModels(): Promise<void> {
		if (!this.view) {
			return;
		}
		try {
			const [models, probe] = await Promise.all([
				this.modelManager.list(),
				this.modelManager.healthProbe(),
			]);
			this.post({
				type: "models",
				list: models,
				health: {
					reachable: probe.ok,
					platform: process.platform,
					lastError: probe.error,
				},
			});
		} catch (err) {
			this.logger.error("chat.pushModels", err);
			this.post({
				type: "models",
				list: [],
				health: { reachable: false, platform: process.platform, lastError: String(err) },
			});
		}
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
			.replace(/\{\{cspSource\}\}/g, webview.cspSource)
			.replace(/\{\{nonce\}\}/g, nonce)
			.replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
			.replace(/\{\{styleUri\}\}/g, styleUri.toString());
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
