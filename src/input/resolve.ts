import { basename, dirname, join, resolve } from "node:path";

import type { Files } from "#/ports/files.ts";
import type { AtlasPage, AtlasPageLayout, ResolvedInput } from "#/types.ts";

import { parseAtlas } from "#/spine/atlas.ts";
import { majorFor, readSpineVersion } from "#/spine/version.ts";

const ATLAS_EXTS = [".atlas.txt", ".atlas"];

export async function resolveInput(
	files: Files,
	jsonPath: string,
	atlasOverride?: string,
): Promise<ResolvedInput> {
	const abs = resolve(jsonPath);
	const jsonText = await readText(files, abs, "skeleton json");
	const skeletonName = basename(abs).replace(/\.json$/i, "");

	const atlasPath = atlasOverride
		? resolve(atlasOverride)
		: await findAtlas(files, abs, skeletonName);
	const atlasText = await readText(files, atlasPath, "atlas");

	const version = readSpineVersion(jsonText);
	const pages = await checkTextures(files, parseAtlas(atlasText, dirname(atlasPath)));

	return {
		jsonPath: abs,
		skeletonName,
		jsonText,
		atlasPath,
		atlasText,
		atlas: { pages },
		version,
		major: majorFor(version),
	};
}

export async function resolveInputs(
	files: Files,
	target: string,
	atlasOverride: string | undefined,
	onSkip?: (path: string, reason: string) => void,
): Promise<ResolvedInput[]> {
	const jsonPaths = await collectJsonPaths(files, target);
	if (jsonPaths.length === 0) throw new Error(`no skeleton json found for "${target}"`);

	const isBatch = jsonPaths.length > 1;
	const inputs: ResolvedInput[] = [];
	for (const path of jsonPaths) {
		try {
			inputs.push(await resolveInput(files, path, atlasOverride));
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			if (!onSkip || !isBatch) throw err;
			onSkip(path, reason);
		}
	}
	if (inputs.length === 0) throw new Error(`no renderable skeletons found for "${target}"`);
	return inputs;
}

async function collectJsonPaths(files: Files, target: string): Promise<string[]> {
	if (isGlob(target)) {
		const matches = await files.glob(target);
		return matches
			.filter((entry) => entry.endsWith(".json"))
			.map((entry) => resolve(entry))
			.sort();
	}

	const kind = await files.kindOf(target);
	if (!kind) throw new Error(`no such file or directory: ${target}`);

	if (kind === "directory") {
		const entries = await files.list(target);
		return entries
			.filter((e) => e.kind === "file" && e.name.endsWith(".json"))
			.map((e) => resolve(target, e.name))
			.sort();
	}

	if (!target.endsWith(".json")) throw new Error(`expected a .json skeleton, got: ${target}`);
	return [resolve(target)];
}

function checkTextures(files: Files, layouts: AtlasPageLayout[]): Promise<AtlasPage[]> {
	return Promise.all(
		layouts.map(async (layout) => ({
			...layout,
			textureExists: (await files.kindOf(layout.texturePath)) !== null,
		})),
	);
}

async function findAtlas(files: Files, jsonPath: string, skeletonName: string): Promise<string> {
	const dir = dirname(jsonPath);
	return (
		(await findSameNamedAtlas(files, dir, skeletonName)) ??
		(await findOnlyAtlas(files, dir, jsonPath))
	);
}

async function findSameNamedAtlas(
	files: Files,
	dir: string,
	skeletonName: string,
): Promise<string | null> {
	for (const ext of ATLAS_EXTS) {
		const candidate = join(dir, `${skeletonName}${ext}`);
		if ((await files.kindOf(candidate)) !== null) return candidate;
	}
	return null;
}

async function findOnlyAtlas(files: Files, dir: string, jsonPath: string): Promise<string> {
	const entries = await files.list(dir);
	const atlases = entries
		.map((entry) => entry.name)
		.filter((name) => ATLAS_EXTS.some((ext) => name.endsWith(ext)));
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

async function readText(files: Files, path: string, label: string): Promise<string> {
	try {
		return await files.readText(path);
	} catch {
		throw new Error(`could not read ${label}: ${path}`);
	}
}
