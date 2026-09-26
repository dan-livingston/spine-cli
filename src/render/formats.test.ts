import { describe, expect, it, vi } from "vite-plus/test";

import type { Format } from "#/render/formats.ts";
import type { RunParams } from "#/render/requests.ts";

import { openClipWriter } from "#/render/clip-writer.ts";
import { FORMAT_NAMES } from "#/render/formats.ts";
import {
	parseBackground,
	parseFormat,
	parseSheet,
	parseWebpLossyQuality,
} from "#/render/options.ts";
import { planOutput } from "#/render/output-path.ts";
import { buildRequest } from "#/render/requests.ts";
import { fakeEnv } from "#/test/fake-env.ts";
import { solidClip } from "#/test/fake-render-pool.ts";

vi.mock("gifenc", async (importOriginal) => {
	const namespace = await importOriginal<Record<string, unknown>>();
	return { ...namespace, default: namespace };
});

const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const WITHOUT_TOOLS = "pngseq, png, gif and apng work without it";

interface Row {
	format: Format;
	path: string;
	isDir: boolean;
	background: typeof WHITE;
	opaqueOnly: boolean;
	quality: boolean;
	still: boolean;
	sheet: boolean;
	tool?: string;
	missing?: string;
}

const ROWS: Row[] = [
	{
		format: "pngseq",
		path: "/out/hero_run",
		isDir: true,
		background: TRANSPARENT,
		opaqueOnly: false,
		quality: false,
		still: false,
		sheet: false,
	},
	{
		format: "png",
		path: "/out/hero_run.png",
		isDir: false,
		background: TRANSPARENT,
		opaqueOnly: false,
		quality: false,
		still: true,
		sheet: true,
	},
	{
		format: "gif",
		path: "/out/hero_run.gif",
		isDir: false,
		background: TRANSPARENT,
		opaqueOnly: false,
		quality: false,
		still: false,
		sheet: false,
	},
	{
		format: "apng",
		path: "/out/hero_run.apng",
		isDir: false,
		background: TRANSPARENT,
		opaqueOnly: false,
		quality: false,
		still: false,
		sheet: false,
	},
	{
		format: "mp4",
		path: "/out/hero_run.mp4",
		isDir: false,
		background: WHITE,
		opaqueOnly: true,
		quality: false,
		still: false,
		sheet: false,
		tool: "ffmpeg",
		missing: `ffmpeg not found on PATH; install ffmpeg to render mp4. ${WITHOUT_TOOLS}`,
	},
	{
		format: "webm",
		path: "/out/hero_run.webm",
		isDir: false,
		background: TRANSPARENT,
		opaqueOnly: false,
		quality: false,
		still: false,
		sheet: false,
		tool: "ffmpeg",
		missing: `ffmpeg not found on PATH; install ffmpeg to render webm. ${WITHOUT_TOOLS}`,
	},
	{
		format: "webp",
		path: "/out/hero_run.webp",
		isDir: false,
		background: TRANSPARENT,
		opaqueOnly: false,
		quality: true,
		still: false,
		sheet: true,
		tool: "img2webp",
		missing: `img2webp not found on PATH; install libwebp to render webp. ${WITHOUT_TOOLS}`,
	},
];

const params = (format: Format): RunParams => ({
	scale: 1,
	fps: 30,
	loops: 1,
	frame: 0.5,
	fit: "declared",
	background: TRANSPARENT,
	format,
});

describe("output formats", () => {
	it("covers every format in documented order", () => {
		expect(ROWS.map((r) => r.format)).toEqual(FORMAT_NAMES);
		expect(() => parseFormat("jpg")).toThrow(
			'unknown format "jpg"; use pngseq, png, gif, apng, mp4, webm or webp',
		);
	});

	it.each(ROWS)("names $format output", ({ format, path, isDir }) => {
		expect(
			planOutput({
				jsonPath: "/p/hero.json",
				skeletonName: "hero",
				animation: "run",
				format,
				outDir: "/out",
			}),
		).toEqual({ path, isDir });
		expect(
			planOutput({
				jsonPath: "/p/hero.json",
				skeletonName: "hero",
				animation: "run",
				format,
				out: "/x",
			}).isDir,
		).toBe(isDir);
	});

	it.each(ROWS)("gives $format its background rule", ({ format, background, opaqueOnly }) => {
		expect(parseBackground(undefined, format)).toEqual(background);
		if (opaqueOnly) {
			expect(() => parseBackground("transparent", format)).toThrow(
				`${format} has no alpha channel; --background must be opaque (got "transparent"); use webm for transparency`,
			);
		} else {
			expect(parseBackground("transparent", format)).toEqual(TRANSPARENT);
		}
	});

	it.each(ROWS)("accepts --quality for $format only if lossy", ({ format, quality }) => {
		if (quality) {
			expect(parseWebpLossyQuality("80", format)).toBe(80);
		} else {
			expect(() => parseWebpLossyQuality("80", format)).toThrow(
				`--quality only applies to webp; ${format} has no lossy quality knob`,
			);
		}
	});

	it.each(ROWS)("renders $format as a still only if it is one", ({ format, still }) => {
		expect(buildRequest("run", params(format)).times).toEqual(still ? [0.5] : undefined);
	});

	it.each(ROWS)("accepts --sheet for $format only if it writes a sheet", ({ format, sheet }) => {
		if (sheet) {
			expect(parseSheet({ sheet: true }, format)).toEqual({ padding: 0 });
		} else {
			expect(() => parseSheet({ sheet: true }, format)).toThrow(
				`--sheet only applies to png and webp; ${format} cannot write a sheet`,
			);
		}
		expect(parseSheet({}, format)).toBeUndefined();
	});

	it.each(ROWS)(
		"probes the tool $format needs and nothing else",
		async ({ format, tool, missing }) => {
			const { env, processes } = fakeEnv();
			const opening = openClipWriter(env, params(format));
			if (missing) await expect(opening).rejects.toThrow(missing);
			else await opening;
			expect(processes.versionChecks).toEqual(tool ? [tool] : []);
		},
	);

	it.each(ROWS)("writes $format to its target", async ({ format, path, isDir, tool }) => {
		const { env, files, processes } = fakeEnv({
			processes: { installed: ["ffmpeg", "img2webp"] },
		});
		const write = await openClipWriter(env, params(format));
		await write({ path, isDir }, solidClip(2, 2, 2));
		if (tool) {
			expect(processes.runsOf(tool)[0].args.at(-1)).toBe(path);
			expect(files.hasDir("/out")).toBe(true);
		} else {
			expect(files.writtenPaths()).toEqual(
				isDir ? [`${path}/0001.png`, `${path}/0002.png`] : [path],
			);
		}
	});
});
