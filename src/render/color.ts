import type { Rgba } from "#/render/harness/contract.ts";

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

const NAMED: Record<string, [number, number, number]> = {
	black: [0, 0, 0],
	white: [255, 255, 255],
	red: [255, 0, 0],
	green: [0, 128, 0],
	blue: [0, 0, 255],
	gray: [128, 128, 128],
	grey: [128, 128, 128],
	yellow: [255, 255, 0],
	cyan: [0, 255, 255],
	magenta: [255, 0, 255],
};

export function parseColor(raw: string): Rgba | null {
	const value = raw.trim().toLowerCase();
	if (value === "transparent" || value === "none") return { ...TRANSPARENT };
	if (NAMED[value]) {
		const [r, g, b] = NAMED[value];
		return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
	}
	if (value.startsWith("#")) return parseHex(value.slice(1));
	const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
	if (rgb) return parseRgbFn(rgb[1]);
	return null;
}

const HEX_DIGITS = /^[0-9a-f]+$/;

const DECIMAL = /^\d*\.?\d+$/;

function parseHex(hex: string): Rgba | null {
	if (!HEX_DIGITS.test(hex)) return null;
	let r: number;
	let g: number;
	let b: number;
	let a = 255;
	if (hex.length === 3 || hex.length === 4) {
		r = parseInt(hex[0] + hex[0], 16);
		g = parseInt(hex[1] + hex[1], 16);
		b = parseInt(hex[2] + hex[2], 16);
		if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16);
	} else if (hex.length === 6 || hex.length === 8) {
		r = parseInt(hex.slice(0, 2), 16);
		g = parseInt(hex.slice(2, 4), 16);
		b = parseInt(hex.slice(4, 6), 16);
		if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16);
	} else {
		return null;
	}
	if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
	return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

function parseRgbFn(body: string): Rgba | null {
	const parts = body.split(",").map((p) => p.trim());
	if (parts.length < 3 || parts.length > 4) return null;
	if (!parts.every((p) => DECIMAL.test(p))) return null;
	const [r, g, b] = parts.map((p) => Number(p));
	const a = parts.length === 4 ? Number(parts[3]) : 1;
	if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
	return { r: r / 255, g: g / 255, b: b / 255, a };
}
