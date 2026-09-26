import { describe, expect, it } from "vite-plus/test";

import type { VideoFormat, VideoOptions } from "#/encode/video.ts";
import type { Rgba } from "#/render/harness/contract.ts";

import { encodeVideo } from "#/encode/video.ts";
import { BLUE, RED, solidFrame } from "#/test/encode-fixtures.ts";
import { FakeProcesses } from "#/test/fake-processes.ts";

function valuesAfter(args: string[], flag: string): string[] {
	return args.flatMap((arg, i) => (args[i - 1] === flag ? [arg] : []));
}

const installed = () => new FakeProcesses({ installed: ["ffmpeg"] });

const clip = [solidFrame(3, 5, RED), solidFrame(3, 5, BLUE)];

const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

function options(fps: number, format: VideoFormat, background: Rgba = TRANSPARENT): VideoOptions {
	return { fps, format, background };
}

describe("encodeVideo", () => {
	it("rejects an empty clip without running ffmpeg", async () => {
		const processes = installed();
		await expect(
			encodeVideo(processes, "ffmpeg", "/out/a.mp4", [], options(30, "mp4")),
		).rejects.toThrow("no frames to encode");
		expect(processes.runs).toEqual([]);
	});

	it("pipes raw rgba frames in play order at the clip size and rate", async () => {
		const processes = installed();
		await encodeVideo(processes, "ffmpeg", "/out/a.mp4", clip, options(24, "mp4"));
		const [run] = processes.runsOf("ffmpeg");
		expect(run.stdin).toEqual(clip.map((f) => f.data));
		const inputEnd = run.args.indexOf("-i") + 2;
		const input = run.args.slice(0, inputEnd);
		expect(input[0]).toBe("-y");
		expect(valuesAfter(input, "-i")).toEqual(["-"]);
		expect(valuesAfter(input, "-f")).toEqual(["rawvideo"]);
		expect(valuesAfter(input, "-pix_fmt")).toEqual(["rgba"]);
		expect(valuesAfter(input, "-s")).toEqual(["3x5"]);
		expect(valuesAfter(input, "-r")).toEqual(["24"]);
		expect(valuesAfter(run.args.slice(inputEnd), "-r")).toEqual(["24"]);
		expect(run.args.at(-1)).toBe("/out/a.mp4");
	});

	it("keeps a fractional frame rate", async () => {
		const processes = installed();
		await encodeVideo(processes, "ffmpeg", "/out/a.webm", clip, options(29.97, "webm"));
		expect(valuesAfter(processes.runs[0].args, "-r")).toEqual(["29.97", "29.97"]);
	});

	it("encodes mp4 as h264 without alpha and webm as vp9 with alpha", async () => {
		const processes = installed();
		await encodeVideo(processes, "ffmpeg", "/out/a.mp4", clip, options(30, "mp4"));
		await encodeVideo(processes, "ffmpeg", "/out/a.webm", clip, options(30, "webm"));
		const [mp4, webm] = processes.runs.map((run) => run.args);
		expect(valuesAfter(mp4, "-c:v")).toEqual(["libx264"]);
		expect(valuesAfter(mp4, "-pix_fmt")).toEqual(["rgba", "yuv420p"]);
		expect(valuesAfter(webm, "-c:v")).toEqual(["libvpx-vp9"]);
		expect(valuesAfter(webm, "-pix_fmt")).toEqual(["rgba", "yuva420p"]);
	});

	it.each([
		["mp4", { r: 1, g: 1, b: 1, a: 1 }, "0xffffff@1"],
		["mp4", { r: 1, g: 0.5, b: 0, a: 1 }, "0xff8000@1"],
		["webm", TRANSPARENT, "0x000000@0"],
		["webm", { r: 0, g: 0, b: 1, a: 0.5 }, "0x0000ff@0.5"],
	] as const)(
		"pads %s odd sizes up to even ones with the background",
		async (format, background, color) => {
			const processes = installed();
			await encodeVideo(
				processes,
				"ffmpeg",
				`/out/a.${format}`,
				clip,
				options(30, format, background),
			);
			expect(valuesAfter(processes.runs[0].args, "-vf")).toEqual([
				`pad=ceil(iw/2)*2:ceil(ih/2)*2:color=${color}`,
			]);
		},
	);

	it("passes on the ffmpeg failure", async () => {
		const processes = installed().fail("ffmpeg", "bad codec");
		await expect(
			encodeVideo(processes, "ffmpeg", "/out/a.mp4", clip, options(30, "mp4")),
		).rejects.toThrow("ffmpeg exited 1: bad codec");
	});
});
