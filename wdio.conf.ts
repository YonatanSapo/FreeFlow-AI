import { join } from "path";
import type { Options } from "@wdio/types";

export const config: Options.Testrunner = {
	runner: "local",
	autoCompileOpts: {
		autoCompile: true,
		tsNodeOpts: {
			project: "./tsconfig.wdio.json",
			transpileOnly: true,
		},
	},
	// Models first: if Chat specs crash the renderer, the Models suite still gets a clean session.
	specs: ["./src/test/wdio/models.spec.ts", "./src/test/wdio/chat.spec.ts"],
	// Run one suite at a time — each spec gets its own VS Code instance.
	maxInstances: 1,
	capabilities: [
		{
			browserName: "vscode",
			browserVersion: "stable",
			"wdio:vscodeOptions": {
				extensionPath: join(__dirname, "."),
				verboseLogging: true,
				userSettings: {
					"workbench.activityBar.visible": true,
					"workbench.statusBar.visible": true,
					"editor.fontSize": 14,
				},
			},
			// Increase the time wdio waits for VSCode to become ready
			"wdio:maxInstances": 1,
		},
	],
	logLevel: "warn",
	waitforTimeout: 20_000,
	connectionRetryTimeout: 120_000,
	connectionRetryCount: 3,
	services: ["vscode"],
	framework: "mocha",
	reporters: ["spec"],
	mochaOpts: {
		ui: "bdd",
		timeout: 120_000,
	},
};
