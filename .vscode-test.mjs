import { defineConfig } from '@vscode/test-cli';
import os from 'os';
import path from 'path';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	mocha: {
		timeout: 30_000,
	},
	// Use an isolated user-data-dir so tests can run alongside an open VS Code window.
	launchArgs: ['--user-data-dir', path.join(os.tmpdir(), 'vscode-test-freeflow-ai')],
});
