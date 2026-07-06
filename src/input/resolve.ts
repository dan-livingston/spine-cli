import { glob, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { ResolvedInput } from "../types.ts";

import { parseAtlas } from "../spine/atlas.ts";
import { majorFor, readSpineVersion } from "../spine/version.ts";

const ATLAS_EXTS = [".atlas.txt", ".atlas"];

// resolve one skeleton json into a fully loaded input. the atlas is found beside
// the json (same basename first, else the only atlas in the directory) unless
// atlasOverride is given.
export async function resolveInput(
	jsonPath: string,
	atlasOverride?: string,
): Promise<ResolvedInput> {
	const abs = resolve(jsonPath);
	const jsonText = await readText(abs, "skeleton json");
	const skeletonName = basename(abs).replace(/\.json$/i, "");

	const atlasPath = atlasOverride ? resolve(atlasOverride) : await findAtlas(abs, skeletonName);
	const atlasText = await readText(atlasPath, "atlas");

	const version = readSpineVersion(jsonText);

	return {
		jsonPath: abs,
		skeletonName,
		jsonText,
		atlasPath,
		atlasText,
		atlas: parseAtlas(atlasText, dirname(atlasPath)),
		version,
		major: majorFor(version),
	};
}

// resolve a file, directory, or glob into one or more inputs. a directory is
// scanned one level deep; use a glob for recursion. jsons without a resolvable
// atlas or spine version are reported via onSkip rather than aborting a batch.
export async function resolveInputs(
	target: string,
	atlasOverride: string | undefined,
	onSkip?: (path: string, reason: string) => void,
): Promise<ResolvedInput[]> {
	const jsonPaths = await collectJsonPaths(target);
	if (jsonPaths.length === 0) throw new Error(`no skeleton json found for "${target}"`);

	// an explicit --atlas applies to every resolved skeleton (shared atlas).
	const inputs: ResolvedInput[] = [];
	for (const path of jsonPaths) {
		try {
			inputs.push(await resolveInput(path, atlasOverride));
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			// a single explicit target surfaces its error; a batch skips and continues
			if (!onSkip || jsonPaths.length === 1) throw err;
			onSkip(path, reason);
		}
	}
	if (inputs.length === 0) throw new Error(`no renderable skeletons found for "${target}"`);
	return inputs;
}

async function collectJsonPaths(target: string): Promise<string[]> {
	if (isGlob(target)) {
		const out: string[] = [];
		for await (const entry of glob(target)) {
			if (entry.endsWith(".json")) out.push(resolve(entry));
		}
		return out.sort();
	}

	const info = await stat(target).catch(() => null);
	if (!info) throw new Error(`no such file or directory: ${target}`);

	if (info.isDirectory()) {
		const entries = await readdir(target, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile() && e.name.endsWith(".json"))
			.map((e) => resolve(target, e.name))
			.sort();
	}

	if (!target.endsWith(".json")) throw new Error(`expected a .json skeleton, got: ${target}`);
	return [resolve(target)];
}

async function findAtlas(jsonPath: string, skeletonName: string): Promise<string> {
	const dir = dirname(jsonPath);

	// prefer an atlas that shares the skeleton's basename
	for (const ext of ATLAS_EXTS) {
		const candidate = join(dir, `${skeletonName}${ext}`);
		if (await exists(candidate)) return candidate;
	}

	// else the single atlas in the directory, if unambiguous
	const entries = await readdir(dir);
	const atlases = entries.filter((name) => ATLAS_EXTS.some((ext) => name.endsWith(ext)));
	if (atlases.length === 1) return join(dir, atlases[0]);

	if (atlases.length === 0) {
		throw new Error(`no atlas found beside ${basename(jsonPath)}; pass --atlas`);
	}
	throw new Error(
		`multiple atlases beside ${basename(jsonPath)} (${atlases.join(", ")}); pass --atlas`,
	);
}

function isGlob(target: string): boolean {
	return /[*?[\]{}]/.test(target);
}

async function exists(path: string): Promise<boolean> {
	return (await stat(path).catch(() => null)) !== null;
}

async function readText(path: string, label: string): Promise<string> {
	try {
		return await readFile(path, "utf8");
	} catch {
		throw new Error(`could not read ${label}: ${path}`);
	}
}

// exported for reuse/testing: strip a skeleton path to its default output base.
export function defaultBase(input: ResolvedInput): string {
	return input.skeletonName || basename(input.jsonPath, extname(input.jsonPath));
}
