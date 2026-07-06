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

// a resolved output target: a file for stills/video, a directory for pngseq.
export interface OutputTarget {
	path: string;
	isDir: boolean;
}

export interface OutputContext {
	jsonPath: string;
	skeletonName: string;
	animation: string;
	// include the animation in the name (batch, or >1 animation selected)
	includeAnimation: boolean;
	// piece name, appended when rendering a slot subset
	piece?: string;
	format: Format;
	// single explicit --out (a file, or a dir for pngseq); only when one output
	out?: string;
	// --out-dir for batch or explicit placement
	outDir?: string;
}

export function planOutput(ctx: OutputContext): OutputTarget {
	if (ctx.out) {
		return { path: ctx.out, isDir: ctx.format === "pngseq" };
	}
	const dir = ctx.outDir ?? dirname(ctx.jsonPath);
	let base = ctx.skeletonName;
	if (ctx.includeAnimation) base += `_${ctx.animation}`;
	if (ctx.piece) base += `_${ctx.piece}`;
	if (ctx.format === "pngseq") {
		return { path: join(dir, base), isDir: true };
	}
	return { path: join(dir, base + EXT[ctx.format]), isDir: false };
}
