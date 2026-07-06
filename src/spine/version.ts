import type { SpineMajor } from "../types.ts";

// pull the exported runtime version out of a skeleton json. spine writes it into
// skeleton.spine, e.g. { "skeleton": { "spine": "4.2.40", ... } }. older exports
// occasionally put it at the top level, so check both.
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

// dispatch a full version string to the bundled runtime that reads it. the json
// format is stable within 4.0 and within 4.1+; 4.1 and 4.2 share a format, so a
// 4.2 runtime reads both. anything < 4.1 uses the 4.0 runtime.
export function majorFor(version: string): SpineMajor {
	const match = /^(\d+)\.(\d+)/.exec(version);
	if (!match) throw new Error(`unrecognized spine version "${version}"`);
	const major = Number(match[1]);
	const minor = Number(match[2]);
	if (major < 4 || (major === 4 && minor === 0)) return "4.0";
	return "4.2";
}
