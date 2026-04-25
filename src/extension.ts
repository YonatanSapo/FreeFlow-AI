import * as vscode from "vscode";
import { OllamaClient } from "./core/ollama/client.js";
import { ModelManager, KNOWN_LOCAL_MODELS } from "./core/models/manager.js";
import { ChatManager } from "./core/chat/manager.js";
import { VSCodeLogger } from "./adapters/vscodeLogger.js";
import { getOllamaBaseUrl } from "./adapters/vscodeConfig.js";
import { ChatViewProvider } from "./ui/chatViewProvider.js";
import { ModelsViewProvider } from "./ui/modelsViewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
	const logger = new VSCodeLogger("PromptRouter");
	context.subscriptions.push({ dispose: () => logger.dispose() });

	const client = new OllamaClient({ baseUrl: getOllamaBaseUrl });
	const modelManager = new ModelManager(client);
	const chatManager = new ChatManager(client);

	const chatProvider = new ChatViewProvider(context, chatManager, modelManager, logger);
	const modelsProvider = new ModelsViewProvider(context, modelManager, logger);

	// retainContextWhenHidden keeps the webview DOM alive when the panel is
	// collapsed / hidden.  Combined with the ready-handshake pattern, this means
	// the "Checking…" dot will never reappear on re-focus — state is preserved.
	const webviewOptions = { webviewOptions: { retainContextWhenHidden: true } };

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, webviewOptions),
		vscode.window.registerWebviewViewProvider(ModelsViewProvider.viewType, modelsProvider, webviewOptions),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("promptrouter.openChat", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.promptrouter");
			await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
		}),

		vscode.commands.registerCommand("promptrouter.openModels", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.promptrouter");
			await vscode.commands.executeCommand(`${ModelsViewProvider.viewType}.focus`);
		}),

		vscode.commands.registerCommand("promptrouter.refreshModels", async () => {
			logger.show();
			logger.info("refreshModels: triggered by command");
			await modelsProvider.refresh();
			logger.info("refreshModels: done");
		}),

		vscode.commands.registerCommand("promptrouter.installModel", async () => {
			const tag = await vscode.window.showQuickPick(
				[...KNOWN_LOCAL_MODELS, "$custom"].map((t) =>
					t === "$custom"
						? { label: "Custom tag…", detail: "Enter any Ollama model tag" }
						: { label: t },
				),
				{ title: "Install Ollama model", placeHolder: "Select a model tag" },
			);
			if (!tag) {
				return;
			}
			let chosen = tag.label;
			if (chosen === "Custom tag…") {
				const custom = await vscode.window.showInputBox({
					title: "Ollama model tag",
					placeHolder: "e.g. llama3.2:3b",
				});
				if (!custom) {
					return;
				}
				chosen = custom;
			}
			await modelsProvider.installModel(chosen);
		}),

		vscode.commands.registerCommand("promptrouter.removeModel", async () => {
			const models = await modelManager.list();
			const installed = models.filter((m) => m.status === "installed");
			const pick = await vscode.window.showQuickPick(
				installed.map((m) => ({ label: m.displayName, tag: m.tag })),
				{ title: "Remove Ollama model" },
			);
			if (!pick) {
				return;
			}
			await modelsProvider.removeModel(pick.tag);
		}),
	);

	logger.info("PromptRouter activated");
}

export function deactivate(): void {
	// Subscriptions in context.subscriptions are disposed automatically.
}
