import { describe, expect, it } from "vite-plus/test";

import type { MeasureResult } from "#/render/harness/contract.ts";
import type { RunParams } from "#/render/requests.ts";

import { buildMeasureReq, buildRequest, pickBox } from "#/render/requests.ts";

const params = (over: Partial<RunParams> = {}): RunParams => ({
	scale: 1,
	fps: 30,
	loops: 1,
	frame: 0,
	fit: "declared",
	background: { r: 0, g: 0, b: 0, a: 0 },
	format: "gif",
	ffmpeg: null,
	img2webp: null,
	...over,
});

const box = (x: number) => ({ x, y: x, width: 10 + x, height: 20 + x });

const boxes: MeasureResult = {
	perPiece: [box(1), box(2), box(3)],
	selectedUnion: box(4),
	skeletonUnion: box(5),
	declared: box(6),
};

describe("pickBox", () => {
	it("frames each fit mode to the box the README describes", () => {
		expect(pickBox("declared", boxes, 0)).toEqual(box(6));
		expect(pickBox("bounds", boxes, 0)).toEqual(box(5));
		expect(pickBox("shared", boxes, 2)).toEqual(box(4));
	});

	it("gives each piece its own box under fit piece", () => {
		expect([0, 1, 2].map((i) => pickBox("piece", boxes, i))).toEqual([box(1), box(2), box(3)]);
	});
});

describe("buildRequest", () => {
	it("renders a single still at --frame for png", () => {
		const req = buildRequest("run", params({ format: "png", frame: 0.5 }));
		expect(req.times).toEqual([0.5]);
		expect(req.animation).toBe("run");
	});

	it("renders the whole clip for every animated format", () => {
		for (const format of ["pngseq", "gif", "apng", "mp4", "webm", "webp"] as const) {
			expect(buildRequest("run", params({ format, frame: 0.5 })).times).toBeUndefined();
		}
	});

	it("uses 0 as the no-duration sentinel so the animation length applies", () => {
		expect(buildRequest("run", params()).duration).toBe(0);
		expect(buildRequest("run", params({ duration: 2.5 })).duration).toBe(2.5);
	});

	it("carries timing, skin, size and background through", () => {
		const background = { r: 1, g: 1, b: 1, a: 1 };
		const req = buildRequest(
			"walk",
			params({
				fps: 12,
				loops: 3,
				skin: "red",
				width: 64,
				height: 48,
				fit: "bounds",
				background,
			}),
		);
		expect(req).toEqual({
			animation: "walk",
			skin: "red",
			fps: 12,
			duration: 0,
			loops: 3,
			fit: "bounds",
			times: undefined,
			width: 64,
			height: 48,
			background,
		});
	});
});

describe("buildMeasureReq", () => {
	it("measures with the same timing as the render and no output settings", () => {
		const p = params({ format: "png", frame: 1.25, fps: 24, fit: "shared", width: 50 });
		const pieces = [["door/*"], ["chips/a", "chips/b"]];
		const measure = buildMeasureReq("open", pieces, p);
		const render = buildRequest("open", p);
		expect(measure).toEqual({
			animation: "open",
			skin: undefined,
			fps: 24,
			duration: 0,
			loops: 1,
			fit: "shared",
			times: [1.25],
			pieces,
		});
		expect(measure.times).toEqual(render.times);
		expect(measure).not.toHaveProperty("background");
		expect(measure).not.toHaveProperty("width");
	});
});
