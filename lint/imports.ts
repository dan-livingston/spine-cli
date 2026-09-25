import type { DummyRuleMap } from "vite-plus/lint";

type Restriction = { group: string[]; message: string };

type Rule = DummyRuleMap["no-restricted-imports"];

const RELATIVE: Restriction = {
	group: ["./*", "../*"],
	message: "Use #/ subpath imports instead of relative paths.",
};

const IO_MODULES = [
	"node:*",
	"node:*/*",
	"!node:path",
	"!node:url",
	"!node:util",
	"!node:crypto",
	"fs",
	"fs/promises",
	"os",
	"child_process",
	"process",
	"http",
	"https",
	"net",
	"playwright-core",
];

const IO: Restriction = {
	group: IO_MODULES,
	message:
		"Real IO lives behind a port. Take Files, Processes or the render pool off the Env; only an adapter may import this.",
};

const IO_IN_TESTS: Restriction = {
	group: IO_MODULES,
	message: "Tests must not touch the real disk, processes, or browser. Seed the fakes instead.",
};

export const ADAPTER_FILES = ["src/adapters/*.ts"];

export const COMPOSITION_ROOT_FILES = ["src/cli.ts"];

function specifierOf(file: string): string {
	return file.replace(/^src\//, "#/");
}

const ADAPTER_MODULES = [
	...ADAPTER_FILES.map(specifierOf),
	...COMPOSITION_ROOT_FILES.map(specifierOf),
];

const ADAPTERS: Restriction = {
	group: ADAPTER_MODULES,
	message: "Real adapters are wired at the composition root. Take the port off the Env instead.",
};

const ADAPTERS_IN_TESTS: Restriction = {
	group: ADAPTER_MODULES,
	message: "Tests must not build real adapters. Use the fakes.",
};

const ADAPTERS_IN_ADAPTERS: Restriction = {
	group: ADAPTER_MODULES,
	message: "An adapter does not reach for another adapter.",
};

const TEST_HELPERS: Restriction = {
	group: ["#/test/*"],
	message: "A test helper is for tests. Import it from a test file.",
};

function restricted(...patterns: Restriction[]): Rule {
	return ["error", { patterns }];
}

export const GLOBALS: DummyRuleMap["no-restricted-globals"] = [
	"error",
	{
		name: "process",
		message:
			"The shell is real IO. Read it at the composition root and hand it over, or take a port.",
	},
	{
		name: "fetch",
		message: "The network is real IO. Put it behind a port; only its adapter may call this.",
	},
	{
		name: "Date",
		message: "The clock is real IO. Put it behind a port; only its adapter may read it.",
	},
];

export const IMPORTS = {
	production: restricted(RELATIVE, IO, ADAPTERS, TEST_HELPERS),
	adapters: restricted(RELATIVE, ADAPTERS_IN_ADAPTERS, TEST_HELPERS),
	compositionRoots: restricted(RELATIVE, IO, TEST_HELPERS),
	tests: restricted(RELATIVE, IO_IN_TESTS, ADAPTERS_IN_TESTS),
};
