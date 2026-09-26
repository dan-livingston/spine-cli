import { dirname, join } from "node:path";

import type { Format } from "#/render/formats.ts";

import { formatSpec } from "#/render/formats.ts";

export interface OutputTarget {
	path: string;
	isDir: boolean;
}

export interface OutputContext {
	jsonPath: string;
	skeletonName: string;
	animation: string;
	piece?: string;
	format: Format;
	out?: string;
	outDir?: string;
}

export function planOutput(ctx: OutputContext): OutputTarget {
	const { extension } = formatSpec(ctx.format);
	if (ctx.out) {
		return { path: ctx.out, isDir: extension === undefined };
	}
	const dir = ctx.outDir ?? dirname(ctx.jsonPath);
	let base = `${ctx.skeletonName}_${flattenFolders(ctx.animation)}`;
	if (ctx.piece) base += `_${ctx.piece}`;
	if (extension === undefined) {
		return { path: join(dir, base), isDir: true };
	}
	return { path: join(dir, base + extension), isDir: false };
}

function flattenFolders(name: string): string {
	return name.replace(/[\\/]/g, "_");
}
