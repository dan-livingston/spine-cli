import { defineConfig } from "vite-plus";

import { IMPORTS } from "./lint/imports.ts";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		// a cli bin, not a consumed library, so no .d.ts generation
		entry: ["src/cli.ts"],
		exports: true,
	},
	lint: {
		options: {
			typeAware: true,
			typeCheck: true,
		},
		rules: {
			"no-restricted-imports": IMPORTS.production,
		},
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
