import typescriptEslint from "typescript-eslint";

export default [
	{
		files: ["**/*.ts"],
	},
	{
		plugins: {
			"@typescript-eslint": typescriptEslint.plugin,
		},

		languageOptions: {
			parser: typescriptEslint.parser,
			ecmaVersion: 2022,
			sourceType: "module",
		},

		rules: {
			"@typescript-eslint/naming-convention": ["warn", {
				selector: "import",
				format: ["camelCase", "PascalCase"],
			}],

			curly: "error",
			eqeqeq: "error",
			"no-throw-literal": "error",
			semi: "error",
		},
	},
	{
		// wdio spec files use browser/$/$$/ describe/it as injected globals —
		// skip linting them with the extension's TypeScript rules.
		ignores: ["src/test/wdio/**"],
	},
	{
		// Enforce that src/core/ stays free of VS Code coupling.
		files: ["src/core/**/*.ts"],
		rules: {
			"no-restricted-imports": ["error", {
				paths: [
					{
						name: "vscode",
						message: "src/core/ must not import 'vscode'. Move VS Code-specific code to src/adapters/ or src/ui/.",
					},
				],
				patterns: [
					{
						group: ["vscode*"],
						message: "src/core/ must not import 'vscode'. Move VS Code-specific code to src/adapters/ or src/ui/.",
					},
				],
			}],
		},
	},
];
