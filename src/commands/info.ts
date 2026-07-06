import type { ResolvedInput } from "../types.ts";

import { resolveInput } from "../input/resolve.ts";
import { parseSkeletonInfo } from "../spine/skeleton-info.ts";

export interface InfoOptions {
	atlas?: string;
	json?: boolean;
	verbose?: boolean;
}

export async function infoCommand(skeleton: string, options: InfoOptions): Promise<void> {
	const input = await resolveInput(skeleton, options.atlas);
	const info = parseSkeletonInfo(input.jsonText);

	if (options.json) {
		console.log(JSON.stringify(buildJson(input, info), null, 2));
		return;
	}
	console.log(renderText(input, info, options.verbose ?? false));
}

// structured json payload, stable keys, no human text.
function buildJson(input: ResolvedInput, info: ReturnType<typeof parseSkeletonInfo>) {
	return {
		name: input.skeletonName,
		version: input.version,
		major: input.major,
		size: { width: info.width, height: info.height },
		bones: info.bones,
		slots: info.slots,
		attachments: info.attachments,
		hasMeshes: info.hasMeshes,
		hasClipping: info.hasClipping,
		skins: info.skins,
		animations: info.animations,
		constraints: info.constraints,
		atlas: {
			path: input.atlasPath,
			pageCount: input.atlas.pages.length,
			pages: input.atlas.pages.map((p) => ({
				name: p.name,
				width: p.width,
				height: p.height,
				textureExists: p.textureExists,
				regionCount: p.regions.length,
			})),
			missingTextures: input.atlas.pages.filter((p) => !p.textureExists).map((p) => p.name),
		},
	};
}

function renderText(
	input: ResolvedInput,
	info: ReturnType<typeof parseSkeletonInfo>,
	verbose: boolean,
): string {
	const lines: string[] = [];

	lines.push(`${input.skeletonName}  (spine ${input.version})`);

	// animations with durations, name column padded to the longest name
	lines.push(`animations (${info.animations.length}):`);
	const nameWidth = Math.max(0, ...info.animations.map((a) => a.name.length));
	for (const a of info.animations) {
		lines.push(`  ${a.name.padEnd(nameWidth)}  ${a.duration.toFixed(3)}s`);
	}

	const skinNames = info.skins.length > 0 ? info.skins.join(", ") : "(none)";
	lines.push(`skins (${info.skins.length}): ${skinNames}`);

	lines.push(
		`bones ${info.bones}  slots ${info.slots}  attachments ${info.attachments}` +
			`  meshes ${yn(info.hasMeshes)}  clipping ${yn(info.hasClipping)}`,
	);

	const c = info.constraints;
	lines.push(
		`constraints: ik ${c.ik}  transform ${c.transform}  path ${c.path}  physics ${c.physics}`,
	);

	const pages = input.atlas.pages;
	lines.push(`atlas: ${pages.length} ${pages.length === 1 ? "page" : "pages"}`);
	for (const p of pages) {
		lines.push(
			`  ${p.name}  ${p.width}x${p.height}${verbose ? `  ${p.regions.length} regions` : ""}`,
		);
	}

	for (const p of pages) {
		if (!p.textureExists) lines.push(`WARNING missing texture: ${p.name}`);
	}

	return lines.join("\n");
}

function yn(value: boolean): string {
	return value ? "yes" : "no";
}
