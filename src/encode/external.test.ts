import { describe, expect, it } from "vite-plus/test";

import { findExternalEncoders } from "#/encode/external.ts";
import { FakeProcesses } from "#/test/fake-processes.ts";

const everything = () => new FakeProcesses({ installed: ["ffmpeg", "img2webp"] });

describe("findExternalEncoders", () => {
	it.each(["pngseq", "png", "gif", "apng"] as const)(
		"needs no external tool for %s, even with none installed",
		async (format) => {
			const processes = new FakeProcesses();
			expect(await findExternalEncoders(processes, format)).toEqual({
				ffmpeg: null,
				img2webp: null,
			});
			expect(processes.versionChecks).toEqual([]);
		},
	);

	it.each(["mp4", "webm"] as const)("uses ffmpeg alone for %s", async (format) => {
		expect(await findExternalEncoders(everything(), format)).toEqual({
			ffmpeg: "ffmpeg",
			img2webp: null,
		});
	});

	it("uses img2webp alone for webp", async () => {
		expect(await findExternalEncoders(everything(), "webp")).toEqual({
			ffmpeg: null,
			img2webp: "img2webp",
		});
	});

	it.each(["mp4", "webm"] as const)("tells the user to install ffmpeg for %s", async (format) => {
		const processes = new FakeProcesses({ installed: ["img2webp"] });
		await expect(findExternalEncoders(processes, format)).rejects.toThrow(
			`ffmpeg not found on PATH; install ffmpeg to render ${format}. pngseq, png, gif and apng work without it`,
		);
	});

	it("tells the user to install libwebp for webp", async () => {
		const processes = new FakeProcesses({ installed: ["ffmpeg"] });
		await expect(findExternalEncoders(processes, "webp")).rejects.toThrow(
			"img2webp not found on PATH; install libwebp to render webp. pngseq, png, gif and apng work without it",
		);
	});
});
