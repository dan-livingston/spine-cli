import { describe, expect, it } from "vite-plus/test";

import { assertDistinctPieceNames, resolvePieces } from "#/render/pieces.ts";

const SLOTS = ["door/left", "door/right", "chips/red", "chips/blue", "background", "shadow"];

function resolve(specs: string[], names: string[] = SLOTS) {
	return resolvePieces(names, specs);
}

describe("resolvePieces", () => {
	it("makes one piece per spec, keeping slot order and naming it from the spec", () => {
		const { pieces } = resolve(["door/*", "chips/*"]);
		expect(pieces).toEqual([
			{ name: "door", slots: ["door/left", "door/right"] },
			{ name: "chips", slots: ["chips/red", "chips/blue"] },
		]);
	});

	it("joins comma-separated globs into one piece in skeleton slot order", () => {
		const { pieces } = resolve(["shadow, door/left"]);
		expect(pieces).toEqual([{ name: "shadow-door-left", slots: ["door/left", "shadow"] }]);
	});

	it("matches ? as exactly one character", () => {
		const { pieces } = resolve(["chips/re?", "chips/?"], ["chips/red", "chips/re", "chips/b"]);
		expect(pieces.map((p) => p.slots)).toEqual([["chips/red"], ["chips/b"]]);
	});

	it("anchors globs to the whole slot name", () => {
		const { pieces, unmatched } = resolve(["door", "left"]);
		expect(pieces).toEqual([]);
		expect(unmatched).toEqual(["door", "left"]);
	});

	it("treats regex metacharacters in slot names literally", () => {
		const names = ["arm.l", "armxl", "a+b", "(x)", "[y]", "c|d"];
		const { pieces } = resolve(["arm.l", "a+b", "(x)", "[y]", "c|d"], names);
		expect(pieces.map((p) => p.slots)).toEqual([["arm.l"], ["a+b"], ["(x)"], ["[y]"], ["c|d"]]);
	});

	it("reports each spec that matches nothing and keeps the others", () => {
		const { pieces, unmatched } = resolve(["nope/*", "background"]);
		expect(unmatched).toEqual(["nope/*"]);
		expect(pieces).toEqual([{ name: "background", slots: ["background"] }]);
	});

	it("keeps dots, underscores and dashes in the piece name and collapses other runs to one dash", () => {
		const { pieces } = resolve(["arm.l_x-/y*"], ["arm.l_x-/y1"]);
		expect(pieces.map((p) => p.name)).toEqual(["arm.l_x-y"]);
	});

	it("names a pure-wildcard piece 'piece'", () => {
		const { pieces } = resolve(["*"]);
		expect(pieces).toEqual([{ name: "piece", slots: SLOTS }]);
	});

	it("rejects a spec with no globs in it", () => {
		expect(() => resolve([" , ,"])).toThrow("empty --piece spec");
	});

	it("refuses a skeleton with no slots", () => {
		expect(() => resolvePieces([], ["*"])).toThrow(
			"skeleton has no slots to select pieces from",
		);
	});
});

describe("assertDistinctPieceNames", () => {
	it("accepts specs whose output names differ", () => {
		expect(() => assertDistinctPieceNames(["door/*", "chips/*", "background"])).not.toThrow();
	});

	it("rejects two specs that map to the same output name", () => {
		expect(() => assertDistinctPieceNames(["door/*", "door*"])).toThrow(
			'--piece "door/*" and "door*" both map to output name "door"; rename one',
		);
	});

	it("rejects two pure-wildcard specs that both fall back to 'piece'", () => {
		expect(() => assertDistinctPieceNames(["*", "**"])).toThrow('output name "piece"');
	});
});
