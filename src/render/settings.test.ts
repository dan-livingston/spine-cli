import { describe, expect, it } from "vite-plus/test";

import { parseRenderSettings } from "#/render/settings.ts";

describe("parseRenderSettings", () => {
	it("fills README defaults when no flags are given", () => {
		expect(parseRenderSettings({})).toEqual({
			format: "pngseq",
			fps: 30,
			scale: 1,
			loops: 1,
			frame: 0,
			concurrency: 1,
			width: undefined,
			height: undefined,
			duration: undefined,
			fit: "declared",
			skin: undefined,
			background: { r: 0, g: 0, b: 0, a: 0 },
			lossyQuality: undefined,
			pieceSpecs: [],
			dryRun: false,
		});
	});

	it("rounds whole-number flags and keeps fractional ones", () => {
		expect(
			parseRenderSettings({
				format: "webp",
				fps: "12.5",
				scale: "0.5",
				width: "10.6",
				height: "20.4",
				loops: "2.4",
				concurrency: "3.5",
				duration: "1.5",
				frame: "0.25",
				quality: "79.5",
			}),
		).toMatchObject({
			fps: 12.5,
			scale: 0.5,
			width: 11,
			height: 20,
			loops: 2,
			concurrency: 4,
			duration: 1.5,
			frame: 0.25,
			lossyQuality: 80,
		});
	});

	it("passes pieces, skin and dry run through", () => {
		expect(
			parseRenderSettings({ piece: ["head*"], fit: "piece", skin: "gold", dryRun: true }),
		).toMatchObject({ pieceSpecs: ["head*"], fit: "piece", skin: "gold", dryRun: true });
	});

	it.each([
		[{ fps: "fast" }, '--fps must be a number, got "fast"'],
		[{ fps: "0.5" }, "--fps must be >= 1"],
		[{ scale: "0" }, "--scale must be > 0"],
		[{ width: "0.4" }, "--width must be >= 1"],
		[{ width: "" }, '--width must be a number, got ""'],
		[{ height: " " }, '--height must be a number, got " "'],
		[{ duration: "" }, '--duration must be a number, got ""'],
		[{ duration: "0" }, "--duration must be > 0"],
		[{ loops: "0" }, "--loops must be >= 1"],
		[{ frame: "-1" }, "--frame must be >= 0"],
		[{ concurrency: "0" }, "--concurrency must be >= 1"],
		[{ format: "jpg" }, 'unknown format "jpg"; use pngseq, png, gif, apng, mp4, webm or webp'],
		[{ fit: "shared" }, "--fit shared needs at least one --piece"],
		[
			{ format: "gif", quality: "80" },
			"--quality only applies to webp; gif has no lossy quality knob",
		],
		[
			{ format: "mp4", background: "transparent" },
			'mp4 has no alpha channel; --background must be opaque (got "transparent"); use webm for transparency',
		],
		[
			{ piece: ["head*", "head"] },
			'--piece "head*" and "head" both map to output name "head"; rename one',
		],
	])("rejects %o", (options, message) => {
		expect(() => parseRenderSettings(options)).toThrow(message);
	});
});
