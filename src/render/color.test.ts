import { describe, expect, it } from "vite-plus/test";

import { parseColor, TRANSPARENT } from "#/render/color.ts";

const rgba = (r: number, g: number, b: number, a = 255) => ({
	r: r / 255,
	g: g / 255,
	b: b / 255,
	a: a / 255,
});

describe("parseColor", () => {
	it("reads transparent and none as fully clear black", () => {
		expect(parseColor("transparent")).toEqual(TRANSPARENT);
		expect(parseColor("none")).toEqual(TRANSPARENT);
	});

	it("returns a fresh object for transparent so callers cannot mutate the shared constant", () => {
		expect(parseColor("transparent")).not.toBe(TRANSPARENT);
	});

	it("reads named colors case-insensitively and ignores surrounding space", () => {
		expect(parseColor("  White ")).toEqual(rgba(255, 255, 255));
		expect(parseColor("GREEN")).toEqual(rgba(0, 128, 0));
	});

	it.each([
		["black", 0, 0, 0],
		["white", 255, 255, 255],
		["red", 255, 0, 0],
		["green", 0, 128, 0],
		["blue", 0, 0, 255],
		["gray", 128, 128, 128],
		["grey", 128, 128, 128],
		["yellow", 255, 255, 0],
		["cyan", 0, 255, 255],
		["magenta", 255, 0, 255],
	])("reads the named color %s as opaque rgb(%i, %i, %i)", (name, r, g, b) => {
		expect(parseColor(name)).toEqual(rgba(r, g, b));
	});

	it("reads the four hex lengths", () => {
		expect(parseColor("#f80")).toEqual(rgba(255, 136, 0));
		expect(parseColor("#f808")).toEqual(rgba(255, 136, 0, 136));
		expect(parseColor("#FF8800")).toEqual(rgba(255, 136, 0));
		expect(parseColor("#ff880080")).toEqual(rgba(255, 136, 0, 128));
	});

	it("rejects hex of the wrong length or with non-hex digits", () => {
		expect(parseColor("#")).toBeNull();
		expect(parseColor("#12")).toBeNull();
		expect(parseColor("#12345")).toBeNull();
		expect(parseColor("#1234567")).toBeNull();
		expect(parseColor("#ggg")).toBeNull();
		expect(parseColor("#zz0000")).toBeNull();
	});

	it("reads rgb() and rgba() with alpha already in 0..1", () => {
		expect(parseColor("rgb(255, 0, 128)")).toEqual({ r: 1, g: 0, b: 128 / 255, a: 1 });
		expect(parseColor("RGBA(0,0,0,0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
	});

	it("treats the rgb and rgba spellings alike for three or four channels", () => {
		expect(parseColor("rgba(0, 0, 255)")).toEqual({ r: 0, g: 0, b: 1, a: 1 });
		expect(parseColor("rgb(0, 0, 255, 0)")).toEqual({ r: 0, g: 0, b: 1, a: 0 });
	});

	it("rejects rgb() with the wrong number of channels or non-numeric channels", () => {
		expect(parseColor("rgb(1,2)")).toBeNull();
		expect(parseColor("rgb(1,2,3,4,5)")).toBeNull();
		expect(parseColor("rgb(a,b,c)")).toBeNull();
		expect(parseColor("rgb(1,2,3")).toBeNull();
	});

	it("returns null for unknown words", () => {
		expect(parseColor("chartreuse-ish")).toBeNull();
		expect(parseColor("")).toBeNull();
	});

	it.fails("needs fix: hex with a junk digit after a valid one is accepted as a color", () => {
		expect(parseColor("#1g2345")).toBeNull();
	});

	it.fails("needs fix: hex with a sign character is parsed into a negative channel", () => {
		expect(parseColor("#-10000")).toBeNull();
	});

	it.fails("needs fix: rgb() with empty channels is read as black instead of rejected", () => {
		expect(parseColor("rgb(,,)")).toBeNull();
	});

	it.fails("needs fix: rgb() with a trailing comma reads the empty alpha as fully transparent", () => {
		expect(parseColor("rgb(255, 0, 0,)")).toBeNull();
	});
});
