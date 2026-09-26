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

interface NumberSpec {
	min?: number;
	exclusiveMin?: boolean;
	max?: number;
	integer?: boolean;
}

export function parseNumber(
	value: string | undefined,
	name: string,
	fallback: number,
	spec: NumberSpec,
): number {
	return parseOptionalNumber(value, name, spec) ?? fallback;
}

export function parseOptionalNumber(
	value: string | undefined,
	name: string,
	spec: NumberSpec,
): number | undefined {
	if (value === undefined) return undefined;
	const n = value.trim() === "" ? Number.NaN : Number(value);
	if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${value}"`);
	if (spec.min !== undefined) {
		if (spec.exclusiveMin ? n <= spec.min : n < spec.min) {
			throw new Error(`--${name} must be ${spec.exclusiveMin ? ">" : ">="} ${spec.min}`);
		}
	}
	if (spec.max !== undefined && n > spec.max) {
		throw new Error(`--${name} must be <= ${spec.max}`);
	}
	return spec.integer ? Math.round(n) : n;
}

export function parseWebpLossyQuality(
	value: string | undefined,
	format: Format,
): number | undefined {
	if (value !== undefined && format !== "webp") {
		throw new Error(`--quality only applies to webp; ${format} has no lossy quality knob`);
	}
	return parseOptionalNumber(value, "quality", { min: 0, max: 100, integer: true });
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
