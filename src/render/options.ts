import type { Fit, Rgba } from "#/render/harness/contract.ts";
import type { Format } from "#/render/output-path.ts";

import { parseColor, TRANSPARENT } from "#/render/color.ts";
import { isFormat } from "#/render/output-path.ts";

export function parseFormat(value: string | undefined): Format {
	if (value === undefined) return "pngseq";
	if (!isFormat(value)) {
		throw new Error(`unknown format "${value}"; use pngseq, png, gif, apng, mp4, webm or webp`);
	}
	return value;
}

export function parseFit(value: string | undefined, hasPieces: boolean): Fit {
	if (value === undefined) return "declared";
	if (value !== "declared" && value !== "bounds" && value !== "piece" && value !== "shared") {
		throw new Error(`unknown fit "${value}"; use declared, bounds, piece or shared`);
	}
	if ((value === "piece" || value === "shared") && !hasPieces) {
		throw new Error(`--fit ${value} needs at least one --piece`);
	}
	return value;
}

interface NumberBounds {
	min?: number;
	exclusiveMin?: boolean;
	max?: number;
}

export function parseNumber(
	value: string | undefined,
	name: string,
	fallback: number,
	bounds: NumberBounds,
): number {
	if (value === undefined) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${value}"`);
	if (bounds.min !== undefined) {
		if (bounds.exclusiveMin ? n <= bounds.min : n < bounds.min) {
			throw new Error(`--${name} must be ${bounds.exclusiveMin ? ">" : ">="} ${bounds.min}`);
		}
	}
	if (bounds.max !== undefined && n > bounds.max) {
		throw new Error(`--${name} must be <= ${bounds.max}`);
	}
	return n;
}

export function parseWebpLossyQuality(
	value: string | undefined,
	format: Format,
): number | undefined {
	if (value === undefined) return undefined;
	if (format !== "webp") {
		throw new Error(`--quality only applies to webp; ${format} has no lossy quality knob`);
	}
	return Math.round(parseNumber(value, "quality", 0, { min: 0, max: 100 }));
}

const OPAQUE_WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

export function parseBackground(value: string | undefined, format: Format): Rgba {
	const formatHasAlpha = format !== "mp4";
	if (value === undefined) return { ...(formatHasAlpha ? TRANSPARENT : OPAQUE_WHITE) };
	const color = parseColor(value);
	if (!color) throw new Error(`unrecognized color "${value}"`);
	if (!formatHasAlpha && color.a < 1) {
		throw new Error(
			`mp4 has no alpha channel; --background must be opaque (got "${value}"); use webm for transparency`,
		);
	}
	return color;
}

export interface RenderOptions {
	atlas?: string;
	animation?: string;
	format?: string;
	out?: string;
	outDir?: string;
	fps?: string;
	scale?: string;
	width?: string;
	height?: string;
	fit?: string;
	skin?: string;
	duration?: string;
	loops?: string;
	frame?: string;
	background?: string;
	quality?: string;
	piece?: string[];
	concurrency?: string;
	dryRun?: boolean;
}
