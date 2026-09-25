import { describe, expect, it } from "vite-plus/test";

import {
	parseBackground,
	parseFit,
	parseFormat,
	parseNumber,
	parseWebpLossyQuality,
} from "#/render/options.ts";

describe("parseFormat", () => {
	it("defaults to pngseq", () => {
		expect(parseFormat(undefined)).toBe("pngseq");
	});

	it("accepts every documented format", () => {
		for (const f of ["pngseq", "png", "gif", "apng", "mp4", "webm", "webp"]) {
			expect(parseFormat(f)).toBe(f);
		}
	});

	it("names the valid formats when given an unknown one", () => {
		expect(() => parseFormat("jpg")).toThrow(
			'unknown format "jpg"; use pngseq, png, gif, apng, mp4, webm or webp',
		);
		expect(() => parseFormat("PNG")).toThrow('unknown format "PNG"');
	});
});

describe("parseFit", () => {
	it("defaults to declared even without pieces", () => {
		expect(parseFit(undefined, false)).toBe("declared");
	});

	it("allows declared and bounds without pieces", () => {
		expect(parseFit("declared", false)).toBe("declared");
		expect(parseFit("bounds", false)).toBe("bounds");
	});

	it("requires a --piece for piece and shared", () => {
		expect(() => parseFit("piece", false)).toThrow("--fit piece needs at least one --piece");
		expect(() => parseFit("shared", false)).toThrow("--fit shared needs at least one --piece");
		expect(parseFit("piece", true)).toBe("piece");
		expect(parseFit("shared", true)).toBe("shared");
	});

	it("names the valid modes when given an unknown one", () => {
		expect(() => parseFit("cover", true)).toThrow(
			'unknown fit "cover"; use declared, bounds, piece or shared',
		);
		expect(() => parseFit("Bounds", false)).toThrow('unknown fit "Bounds"');
	});
});

describe("parseNumber", () => {
	it("returns the fallback only when the flag is absent", () => {
		expect(parseNumber(undefined, "fps", 30, { min: 0, exclusiveMin: true })).toBe(30);
		expect(parseNumber("24", "fps", 30, { min: 0, exclusiveMin: true })).toBe(24);
	});

	it("accepts decimals", () => {
		expect(parseNumber("0.5", "scale", 1, { min: 0, exclusiveMin: true })).toBe(0.5);
	});

	it("rejects text and infinities with the flag name", () => {
		expect(() => parseNumber("fast", "fps", 30, {})).toThrow(
			'--fps must be a number, got "fast"',
		);
		expect(() => parseNumber("Infinity", "fps", 30, {})).toThrow("--fps must be a number");
		expect(() => parseNumber("NaN", "fps", 30, {})).toThrow("--fps must be a number");
	});

	it("allows an inclusive min at the boundary and rejects an exclusive one", () => {
		expect(parseNumber("0", "frame", 0, { min: 0 })).toBe(0);
		expect(() => parseNumber("-0.1", "frame", 0, { min: 0 })).toThrow("--frame must be >= 0");
		expect(() => parseNumber("0", "scale", 1, { min: 0, exclusiveMin: true })).toThrow(
			"--scale must be > 0",
		);
	});

	it("allows the max itself and rejects anything above", () => {
		expect(parseNumber("100", "quality", 0, { max: 100 })).toBe(100);
		expect(() => parseNumber("100.01", "quality", 0, { max: 100 })).toThrow(
			"--quality must be <= 100",
		);
	});

	it("accepts a value just above an exclusive min", () => {
		expect(parseNumber("0.01", "scale", 1, { min: 0, exclusiveMin: true })).toBe(0.01);
	});

	it.fails("needs fix: a blank value is read as 0 instead of rejected as not a number", () => {
		expect(() => parseNumber("  ", "frame", 0, { min: 0 })).toThrow("--frame must be a number");
	});

	it.fails("needs fix: an empty value is read as 0 instead of rejected as not a number", () => {
		expect(() => parseNumber("", "frame", 0, { min: 0 })).toThrow("--frame must be a number");
	});
});

describe("parseWebpLossyQuality", () => {
	it("is undefined when omitted so webp stays lossless", () => {
		expect(parseWebpLossyQuality(undefined, "webp")).toBeUndefined();
		expect(parseWebpLossyQuality(undefined, "gif")).toBeUndefined();
	});

	it("rounds to a whole quality within 0..100", () => {
		expect(parseWebpLossyQuality("0", "webp")).toBe(0);
		expect(parseWebpLossyQuality("79.5", "webp")).toBe(80);
		expect(parseWebpLossyQuality("100", "webp")).toBe(100);
	});

	it("rejects out-of-range quality", () => {
		expect(() => parseWebpLossyQuality("101", "webp")).toThrow("--quality must be <= 100");
		expect(() => parseWebpLossyQuality("-1", "webp")).toThrow("--quality must be >= 0");
	});

	it("rounds down below the half and names --quality when it is not a number", () => {
		expect(parseWebpLossyQuality("79.4", "webp")).toBe(79);
		expect(() => parseWebpLossyQuality("high", "webp")).toThrow(
			'--quality must be a number, got "high"',
		);
	});

	it("refuses --quality for formats other than webp", () => {
		expect(() => parseWebpLossyQuality("80", "mp4")).toThrow(
			"--quality only applies to webp; mp4 has no lossy quality knob",
		);
	});
});

describe("parseBackground", () => {
	it("defaults to transparent for formats with alpha and white for mp4", () => {
		for (const f of ["pngseq", "png", "gif", "apng", "webm", "webp"] as const) {
			expect(parseBackground(undefined, f)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
		}
		expect(parseBackground(undefined, "mp4")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
	});

	it("returns a fresh default each call", () => {
		parseBackground(undefined, "png").a = 1;
		expect(parseBackground(undefined, "png").a).toBe(0);
		parseBackground(undefined, "mp4").r = 0;
		expect(parseBackground(undefined, "mp4").r).toBe(1);
	});

	it("parses a given color", () => {
		expect(parseBackground("#000", "webm")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
		expect(parseBackground("black", "mp4")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
		expect(parseBackground("#ff000080", "gif")).toEqual({ r: 1, g: 0, b: 0, a: 128 / 255 });
	});

	it("reports an unrecognized color", () => {
		expect(() => parseBackground("blurple", "png")).toThrow('unrecognized color "blurple"');
	});

	it("refuses a see-through background for mp4 and points at webm", () => {
		expect(() => parseBackground("transparent", "mp4")).toThrow(
			'mp4 has no alpha channel; --background must be opaque (got "transparent"); use webm for transparency',
		);
		expect(() => parseBackground("#ffffff80", "mp4")).toThrow("mp4 has no alpha channel");
		expect(parseBackground("transparent", "webm").a).toBe(0);
	});

	it.fails("needs fix: a CSS color name like constructor crashes with a TypeError", () => {
		expect(() => parseBackground("constructor", "png")).toThrow(
			'unrecognized color "constructor"',
		);
	});
});
