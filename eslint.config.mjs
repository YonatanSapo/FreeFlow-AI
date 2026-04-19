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

			curly: "warn",
			eqeqeq: "warn",
			"no-throw-literal": "warn",
			semi: "warn",
		},
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
