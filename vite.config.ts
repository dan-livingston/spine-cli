import type { DummyRuleMap } from "vite-plus/lint";

import { defineConfig } from "vite-plus";

import { IMPORTS } from "./lint/imports.ts";

function maxLines(max: number): DummyRuleMap["max-lines"] {
	return ["error", { max, skipBlankLines: false, skipComments: false }];
}

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		entry: ["src/cli.ts"],
		dts: false,
		exports: true,
	},
	lint: {
		jsPlugins: [
			{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
			"./lint/no-comments.ts",
		],
		options: {
			typeAware: true,
			typeCheck: true,
		},
		rules: {
			"no-restricted-imports": IMPORTS.production,
			"spine-cli/no-comments": "error",
			"max-lines": maxLines(250),
		},
		overrides: [
			{
				files: ["**/*.test.ts"],
				rules: { "max-lines": maxLines(400) },
			},
		],
	},
	fmt: {
		tabWidth: 4,
		useTabs: true,
		trailingComma: "all",
		sortImports: {
			groups: [
				"type-import",
				["value-builtin", "value-external"],
				"type-internal",
				"value-internal",
				["type-parent", "type-sibling", "type-index"],
				["value-parent", "value-sibling", "value-index"],
				"unknown",
			],
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
	},
});
