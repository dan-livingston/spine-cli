import type { SpineMajor } from "#/types.ts";

export function majorFor(version: string): SpineMajor {
	const match = /^(\d+)\.(\d+)/.exec(version);
	if (!match) throw new Error(`unrecognized spine version "${version}"`);
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const predates41Format = major < 4 || (major === 4 && minor === 0);
	return predates41Format ? "4.0" : "4.2";
}
