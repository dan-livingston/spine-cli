import type { SpineMajor } from "#/types.ts";

export function readSpineVersion(jsonText: string): string {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		throw new Error("skeleton file is not valid JSON");
	}
	const obj = isRecord(data) ? data : {};
	const skeleton = isRecord(obj.skeleton) ? obj.skeleton : {};
	const version = skeleton.spine ?? obj.spine;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
