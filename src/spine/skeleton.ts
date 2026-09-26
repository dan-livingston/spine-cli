import type { SpineMajor } from "#/types.ts";

import { majorFor } from "#/spine/version.ts";

type Json = Record<string, unknown>;

export interface Skeleton {
	version: string;
	major: SpineMajor;
	animations: string[];
	slots: string[];
	data: Json;
}

export function parseSkeleton(jsonText: string): Skeleton {
	const data = parseRecord(jsonText);
	const version = spineVersion(data);
	return {
		version,
		major: majorFor(version),
		animations: Object.keys(record(data.animations)),
		slots: slotNames(data.slots),
		data,
	};
}

function parseRecord(jsonText: string): Json {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		throw new Error("skeleton file is not valid JSON");
	}
	return record(data);
}

function spineVersion(data: Json): string {
	const version = record(data.skeleton).spine ?? data.spine;
	if (typeof version !== "string" || version.length === 0) {
		throw new Error('skeleton json has no "spine" version field');
	}
	return version;
}

function slotNames(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((slot) => record(slot).name).filter((name) => typeof name === "string");
}

function record(value: unknown): Json {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Json)
		: {};
}
