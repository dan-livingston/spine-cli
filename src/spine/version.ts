import type { SpineMajor } from "#/types.ts";

export function readSpineVersion(jsonText: string): string {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		throw new Error("skeleton file is not valid JSON");
	}
	const obj = data as Record<string, unknown>;
	const skeleton = obj.skeleton as Record<string, unknown> | undefined;
	const version = (skeleton?.spine ?? obj.spine) as string | undefined;
	if (typeof version !== "string" || version.length === 0) {
		throw new Error('skeleton json has no "spine" version field');
	}
	return version;
}

export function majorFor(version: string): SpineMajor {
	const match = /^(\d+)\.(\d+)/.exec(version);
	if (!match) throw new Error(`unrecognized spine version "${version}"`);
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const predates41Format = major < 4 || (major === 4 && minor === 0);
	return predates41Format ? "4.0" : "4.2";
}
