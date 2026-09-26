import { describe, expect, it } from "vite-plus/test";

import type { RunParams } from "#/render/requests.ts";

import { buildRequest } from "#/render/requests.ts";

const params = (over: Partial<RunParams> = {}): RunParams => ({
	scale: 1,
	fps: 30,
	loops: 1,
	frame: 0,
	fit: "declared",
	background: { r: 0, g: 0, b: 0, a: 0 },
	format: "gif",
	...over,
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

	it("renders every frame for a png sheet, not the still at --frame", () => {
		const req = buildRequest(
			"run",
			params({ format: "png", frame: 0.5, sheet: { padding: 0 } }),
		);
		expect(req.times).toBeUndefined();
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

	it("carries a piece's slots and its group's slots for framing", () => {
		const req = buildRequest("open", params({ fit: "shared" }), {
			slots: ["door"],
			groupSlots: ["door", "chips"],
		});
		expect(req).toMatchObject({
			fit: "shared",
			slots: ["door"],
			groupSlots: ["door", "chips"],
		});
	});
});
