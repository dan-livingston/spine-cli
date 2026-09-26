import { dirname, join } from "node:path";

export type Format = "pngseq" | "png" | "gif" | "apng" | "mp4" | "webm" | "webp";

const EXT: Record<Exclude<Format, "pngseq">, string> = {
	png: ".png",
	apng: ".apng",
	gif: ".gif",
	mp4: ".mp4",
	webm: ".webm",
	webp: ".webp",
};

export function isFormat(v: string): v is Format {
	return (
		v === "pngseq" ||
		v === "png" ||
		v === "gif" ||
		v === "apng" ||
		v === "mp4" ||
		v === "webm" ||
		v === "webp"
	);
}

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
	if (ctx.out) {
		return { path: ctx.out, isDir: ctx.format === "pngseq" };
	}
	const dir = ctx.outDir ?? dirname(ctx.jsonPath);
	let base = `${ctx.skeletonName}_${flattenFolders(ctx.animation)}`;
	if (ctx.piece) base += `_${ctx.piece}`;
	if (ctx.format === "pngseq") {
		return { path: join(dir, base), isDir: true };
	}
	return { path: join(dir, base + EXT[ctx.format]), isDir: false };
}

function flattenFolders(name: string): string {
	return name.replace(/[\\/]/g, "_");
}
