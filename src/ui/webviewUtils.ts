import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Generate a cryptographically-random-enough nonce string for Content-Security-Policy.
 * Uses Math.random — sufficient for webview script nonces where the threat model is
 * content injection (not token prediction by a remote attacker).
 */
export function createNonce(): string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let out = "";
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}

/**
 * Load a webview HTML template from `dist/webview/<viewName>/<viewName>.html`,
 * substitute all `{{…}}` placeholders, and return the final HTML string.
 *
 * Template placeholders:
 *   {{cspSource}}  — `webview.cspSource`
 *   {{nonce}}      — freshly-generated nonce
 *   {{scriptUri}}  — `dist/webview/<viewName>.js` as a VS Code webview URI
 *   {{styleUri}}   — `dist/webview/<viewName>/<viewName>.css` as a VS Code webview URI
 *   {{platform}}   — `process.platform`
 */
export function buildWebviewHtml(
	context: vscode.ExtensionContext,
	webview: vscode.Webview,
	viewName: string,
): string {
	const webviewRoot = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
	const htmlPath = path.join(webviewRoot.fsPath, viewName, `${viewName}.html`);
	const template = fs.readFileSync(htmlPath, "utf8");
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, `${viewName}.js`));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, viewName, `${viewName}.css`));
	const nonce = createNonce();
	return template
		.replace(/\{\{cspSource\}\}/g, webview.cspSource)
		.replace(/\{\{nonce\}\}/g, nonce)
		.replace(/\{\{scriptUri\}\}/g, scriptUri.toString())
		.replace(/\{\{styleUri\}\}/g, styleUri.toString())
		.replace(/\{\{platform\}\}/g, process.platform);
}
