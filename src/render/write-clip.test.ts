import { resolve } from "node:path";
import UPNG from "upng-js";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Format } from "#/render/output-path.ts";
import type { Job } from "#/render/plan.ts";
import type { RunParams } from "#/render/requests.ts";

import { toArrayBuffer } from "#/encode/png.ts";
import { writeClip } from "#/render/write-clip.ts";
import { parseGif } from "#/test/encode-fixtures.ts";
import { fakeEnv } from "#/test/fake-env.ts";
import { solidClip } from "#/test/fake-render-pool.ts";

vi.mock("gifenc", async (importOriginal) => {
	const namespace = await importOriginal<Record<string, unknown>>();
	return { ...namespace, default: namespace };
});

const job = (path: string, isDir = false): Job => ({
	input: {
		jsonPath: resolve("/proj/hero.json"),
		skeletonName: "hero",
		jsonText: "{}",
		atlasPath: resolve("/proj/hero.atlas"),
		atlasText: "",
		atlas: { pages: [] },
		version: "4.2.11",
		major: "4.2",
	},
	animation: "idle",
	includeAnimation: false,
	target: { path: resolve(path), isDir },
});

const params = (format: Format, over: Partial<RunParams> = {}): RunParams => ({
	scale: 1,
	fps: 30,
	loops: 1,
	frame: 0,
	fit: "declared",
	background: { r: 0, g: 0, b: 0, a: 0 },
	format,
	ffmpeg: "ffmpeg",
	img2webp: "img2webp",
	...over,
});

const decodePng = (bytes: Uint8Array) => {
	const img = UPNG.decode(toArrayBuffer(bytes));
	return {
		width: img.width,
		height: img.height,
		rgba: [...new Uint8Array(UPNG.toRGBA8(img)[0])],
	};
};

const ascii = (bytes: Uint8Array, start: number, end: number) =>
	String.fromCharCode(...bytes.subarray(start, end));

describe("writeClip still and sequence formats", () => {
	it("writes the first frame as a png, creating the output directory", async () => {
		const { env, files } = fakeEnv();
		const clip = solidClip(3, 2, 2, [0, 128, 255, 255]);
		clip.frames[1].fill(7);
		await writeClip(env, job("/out/deep/hero.png"), clip, params("png"));
		expect(files.writtenPaths()).toEqual(["/out/deep/hero.png"]);
		const png = decodePng(files.bytes("/out/deep/hero.png"));
		expect(png.width).toBe(3);
		expect(png.height).toBe(2);
		expect(png.rgba.slice(0, 4)).toEqual([0, 128, 255, 255]);
	});

	it("writes a pngseq as numbered frames inside the target directory", async () => {
		const { env, files } = fakeEnv();
		const clip = solidClip(2, 2, 3);
		clip.frames.forEach((frame, i) => frame.fill(10 * (i + 1)));
		await writeClip(env, job("/out/hero", true), clip, params("pngseq"));
		expect(files.hasDir("/out/hero")).toBe(true);
		expect(files.filePaths()).toEqual([
			"/out/hero/0001.png",
			"/out/hero/0002.png",
			"/out/hero/0003.png",
		]);
		const firstPixel = (name: string) =>
			decodePng(files.bytes(`/out/hero/${name}`)).rgba.slice(0, 4);
		expect(firstPixel("0001.png")).toEqual([10, 10, 10, 10]);
		expect(firstPixel("0002.png")).toEqual([20, 20, 20, 20]);
		expect(firstPixel("0003.png")).toEqual([30, 30, 30, 30]);
	});

	it("writes an animated apng at the target path", async () => {
		const { env, files } = fakeEnv();
		await writeClip(env, job("/out/b/hero.apng"), solidClip(2, 2, 3), params("apng"));
		const apng = files.bytes("/out/b/hero.apng");
		expect(ascii(apng, 1, 4)).toBe("PNG");
		const { tabs } = UPNG.decode(toArrayBuffer(apng));
		expect(tabs.acTL).toEqual({ num_frames: 3, num_plays: 0 });
	});

	it("writes every frame of a gif at the clip size, delayed by fps", async () => {
		const { env, files } = fakeEnv();
		await writeClip(
			env,
			job("/out/g/hero.gif"),
			solidClip(3, 2, 2),
			params("gif", { fps: 20 }),
		);
		const gif = parseGif(files.bytes("/out/g/hero.gif"));
		expect(gif.width).toBe(3);
		expect(gif.height).toBe(2);
		expect(gif.frames.map((f) => f.delayCs)).toEqual([5, 5]);
	});
});

describe("writeClip external encoders", () => {
	it("pipes raw rgba frames to ffmpeg for mp4 at the clip size and fps", async () => {
		const { env, files, processes } = fakeEnv({ processes: { installed: ["ffmpeg"] } });
		const clip = solidClip(5, 3, 4);
		await writeClip(env, job("/out/vid/hero.mp4"), clip, params("mp4", { fps: 24 }));
		const [run] = processes.runsOf("ffmpeg");
		expect(run.args).toContain("5x3");
		expect(run.args).toContain("libx264");
		expect(run.args[run.args.indexOf("-r") + 1]).toBe("24");
		expect(run.args.at(-1)).toBe(resolve("/out/vid/hero.mp4"));
		expect(run.stdin?.length).toBe(4);
		expect(run.stdin?.[0].length).toBe(5 * 3 * 4);
		expect(files.hasDir("/out/vid")).toBe(true);
	});

	it("uses vp9 with alpha for webm", async () => {
		const { env, processes } = fakeEnv({ processes: { installed: ["ffmpeg"] } });
		await writeClip(env, job("/out/hero.webm"), solidClip(), params("webm"));
		const [run] = processes.runsOf("ffmpeg");
		expect(run.args).toContain("libvpx-vp9");
		expect(run.args).toContain("yuva420p");
	});

	it("refuses mp4 and webm without ffmpeg and runs nothing", async () => {
		const { env, processes } = fakeEnv();
		for (const format of ["mp4", "webm"] as const) {
			await expect(
				writeClip(
					env,
					job(`/out/hero.${format}`),
					solidClip(),
					params(format, { ffmpeg: null }),
				),
			).rejects.toThrow("ffmpeg unavailable");
		}
		expect(processes.runs).toEqual([]);
	});

	it("surfaces an ffmpeg failure", async () => {
		const { env } = fakeEnv({
			processes: { installed: ["ffmpeg"], failures: { ffmpeg: "bad" } },
		});
		await expect(
			writeClip(env, job("/out/hero.mp4"), solidClip(), params("mp4")),
		).rejects.toThrow("ffmpeg exited 1: bad");
	});

	it("encodes webp losslessly from temp frames and cleans the temp dir", async () => {
		const { env, files, processes } = fakeEnv({ processes: { installed: ["img2webp"] } });
		await writeClip(
			env,
			job("/out/hero.webp"),
			solidClip(2, 2, 2),
			params("webp", { fps: 20 }),
		);
		const [run] = processes.runsOf("img2webp");
		expect(run.args.filter((a) => a === "-lossless")).toHaveLength(2);
		expect(run.args).not.toContain("-lossy");
		expect(run.args[run.args.indexOf("-d") + 1]).toBe("50");
		expect(run.args.at(-1)).toBe(resolve("/out/hero.webp"));
		expect(files.tempDirs).toHaveLength(1);
		expect(files.removed).toContain(files.tempDirs[0]);
		expect(files.filePaths()).toEqual([]);
		expect(files.hasDir("/out")).toBe(true);
	});

	it("passes --quality to img2webp as lossy quality", async () => {
		const { env, processes } = fakeEnv({ processes: { installed: ["img2webp"] } });
		await writeClip(
			env,
			job("/out/hero.webp"),
			solidClip(),
			params("webp", { lossyQuality: 75 }),
		);
		const [run] = processes.runsOf("img2webp");
		expect(run.args.join(" ")).toContain("-lossy -q 75");
		expect(run.args).not.toContain("-lossless");
	});

	it("refuses webp without img2webp", async () => {
		const { env, files } = fakeEnv();
		await expect(
			writeClip(env, job("/out/hero.webp"), solidClip(), params("webp", { img2webp: null })),
		).rejects.toThrow("img2webp unavailable");
		expect(files.tempDirs).toEqual([]);
	});
});
