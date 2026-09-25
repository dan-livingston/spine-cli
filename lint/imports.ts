import type { DummyRuleMap } from "vite-plus/lint";

type Restriction = { group: string[]; message: string };

type Rule = DummyRuleMap["no-restricted-imports"];

const RELATIVE: Restriction = {
	group: ["./*", "../*"],
	message: "Use #/ subpath imports instead of relative paths.",
};

function restricted(...patterns: Restriction[]): Rule {
	return ["error", { patterns }];
}

export const IMPORTS = {
	production: restricted(RELATIVE),
};
