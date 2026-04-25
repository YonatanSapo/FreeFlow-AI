import * as vscode from "vscode";
import { OllamaClient } from "./core/ollama/client.js";
import { ModelManager, KNOWN_LOCAL_MODELS } from "./core/models/manager.js";
import { ChatManager } from "./core/chat/manager.js";
import { VSCodeLogger } from "./adapters/vscodeLogger.js";
import { getOllamaBaseUrl } from "./adapters/vscodeConfig.js";
import { ChatViewProvider } from "./ui/chatViewProvider.js";
import { ModelsViewProvider } from "./ui/modelsViewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
	const logger = new VSCodeLogger("FreeFlow-AI");
	context.subscriptions.push({ dispose: () => logger.dispose() });

	const client = new OllamaClient({ baseUrl: getOllamaBaseUrl });
	const modelManager = new ModelManager(client);
	const chatManager = new ChatManager(client);

	const chatProvider = new ChatViewProvider(context, chatManager, modelManager, logger);

	// After install/remove, refresh both views so the Chat model selector stays in sync.
	const modelsProvider: ModelsViewProvider = new ModelsViewProvider(
		context,
		modelManager,
		logger,
		() => Promise.all([chatProvider.refresh(), modelsProvider.refresh()]).then(() => {}),
	);

	// retainContextWhenHidden keeps the webview DOM alive when the panel is
	// collapsed / hidden.  Combined with the ready-handshake pattern, this means
	// the "Checking…" dot will never reappear on re-focus — state is preserved.
	const webviewOptions = { webviewOptions: { retainContextWhenHidden: true } };

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, webviewOptions),
		vscode.window.registerWebviewViewProvider(ModelsViewProvider.viewType, modelsProvider, webviewOptions),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("freeflow-ai.openChat", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.freeflow-ai");
			await vscode.commands.executeCommand(`${ChatViewProvider.viewType}.focus`);
		}),

		vscode.commands.registerCommand("freeflow-ai.openModels", async () => {
			await vscode.commands.executeCommand("workbench.view.extension.freeflow-ai");
			await vscode.commands.executeCommand(`${ModelsViewProvider.viewType}.focus`);
		}),

		vscode.commands.registerCommand("freeflow-ai.refreshModels", async () => {
			logger.show();
			logger.info("refreshModels: triggered by command");
			await Promise.all([chatProvider.refresh(), modelsProvider.refresh()]);
			logger.info("refreshModels: done");
		}),

		vscode.commands.registerCommand("freeflow-ai.installModel", async () => {
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

		vscode.commands.registerCommand("freeflow-ai.removeModel", async () => {
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

	logger.info("FreeFlow-AI activated");
}

export function deactivate(): void {
	// Subscriptions in context.subscriptions are disposed automatically.
}
