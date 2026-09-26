import { describe, expect, it } from "vite-plus/test";

import { boundsOf, declaredBoxScaled, outputSize, unionBox } from "#/render/harness/box.ts";
import { still, stubSession } from "#/test/harness-fixtures.ts";

describe("unionBox", () => {
	it("covers both boxes including negative coordinates", () => {
		expect(
			unionBox(
				{ x: -10, y: 5, width: 20, height: 10 },
				{ x: 0, y: -5, width: 30, height: 5 },
			),
		).toEqual({ x: -10, y: -5, width: 40, height: 20 });
	});

	it("returns the other box when one side is missing", () => {
		const box = { x: 1, y: 2, width: 3, height: 4 };
		expect(unionBox(null, box)).toEqual(box);
		expect(unionBox(box, null)).toEqual(box);
		expect(unionBox(null, null)).toBeNull();
	});

	it("keeps the outer box when one contains the other", () => {
		const outer = { x: 0, y: 0, width: 100, height: 100 };
		expect(unionBox(outer, { x: 10, y: 10, width: 5, height: 5 })).toEqual(outer);
	});
});

describe("outputSize", () => {
	const box = { width: 200, height: 100 };

	it("uses the rounded box size when no size is given", () => {
		expect(outputSize({ width: 199.6, height: 50.4 })).toEqual({ width: 200, height: 50 });
	});

	it("keeps the box aspect ratio from a width alone", () => {
		expect(outputSize(box, 50)).toEqual({ width: 50, height: 25 });
	});

	it("keeps the box aspect ratio from a height alone", () => {
		expect(outputSize(box, undefined, 30)).toEqual({ width: 60, height: 30 });
	});

	it("uses both dimensions as given, ignoring the box ratio", () => {
		expect(outputSize(box, 64, 64)).toEqual({ width: 64, height: 64 });
	});

	it("never returns a dimension below one pixel", () => {
		expect(outputSize({ width: 0, height: 0 })).toEqual({ width: 1, height: 1 });
		expect(outputSize({ width: 1000, height: 1 }, 10)).toEqual({ width: 10, height: 1 });
		expect(outputSize({ width: -5, height: 40 }, undefined, 20)).toEqual({
			width: 1,
			height: 20,
		});
	});
});

describe("boundsOf", () => {
	it("reports the box of the attached slots", () => {
		const { session } = stubSession({
			slots: [
				{ name: "body", at: still({ x: -20, y: 0, width: 40, height: 80 }) },
				{ name: "hat", at: still({ x: -10, y: 80, width: 30, height: 20 }) },
			],
		});
		expect(boundsOf(session)).toEqual({ x: -20, y: 0, width: 40, height: 100 });
	});

	it("returns null when nothing is visible", () => {
		const { session } = stubSession({ slots: [] });
		expect(boundsOf(session)).toBeNull();
	});

	it("returns null for a zero-area skeleton", () => {
		const { session } = stubSession({
			slots: [{ name: "line", at: still({ x: 0, y: 0, width: 10, height: 0 }) }],
		});
		expect(boundsOf(session)).toBeNull();
	});
});

describe("declaredBoxScaled", () => {
	it("scales the declared box by the session scale", () => {
		const { session } = stubSession({
			declared: { x: -50, y: -10, width: 100, height: 200 },
			scale: 0.5,
		});
		expect(declaredBoxScaled(session)).toEqual({ x: -25, y: -5, width: 50, height: 100 });
	});
});
