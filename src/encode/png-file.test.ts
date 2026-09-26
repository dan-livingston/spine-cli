import UPNG from "upng-js";
import { describe, expect, it } from "vite-plus/test";

import type { Rgba } from "#/test/encode-fixtures.ts";

import { writePngFile } from "#/encode/png-file.ts";
import { toArrayBuffer } from "#/encode/png.ts";
import { frameOf, pixelsOf } from "#/test/encode-fixtures.ts";
import { readPng } from "#/test/encode-png-reader.ts";

const IEND = [73, 69, 78, 68];

function noisy(size: number, seed: number) {
	return frameOf(
		size,
		size,
		Array.from(
			{ length: size * size },
			(_, i): Rgba => [(i * 37 + seed) % 256, (i * 91) % 256, (i * 13) % 256, (i * 50) % 256],
		),
	);
}

describe("writePngFile", () => {
	it.each([1, 2, 4, 8])(
		"writes a %ipx still with more colours than bytes to spare, ending in IEND",
		async (size) => {
			const frame = noisy(size, 0);
			const bytes = writePngFile([toArrayBuffer(frame.data)], size, size, []);
			expect(Array.from(bytes.subarray(-8, -4))).toEqual(IEND);
			expect((await readPng(bytes)).shown).toEqual([pixelsOf(frame.data)]);
		},
	);

	it("writes a small animation whole", async () => {
		const frames = [noisy(4, 0), noisy(4, 1), noisy(4, 2)];
		const bytes = writePngFile(
			frames.map((f) => toArrayBuffer(f.data)),
			4,
			4,
			[33, 33, 33],
		);
		expect(Array.from(bytes.subarray(-8, -4))).toEqual(IEND);
		expect((await readPng(bytes)).shown).toEqual(frames.map((f) => pixelsOf(f.data)));
	});

	it("matches upng-js byte for byte where its buffer is big enough", () => {
		const frames = [noisy(32, 0), noisy(32, 5)];
		const images = frames.map((f) => toArrayBuffer(f.data));
		expect(writePngFile(images, 32, 32, [40, 40])).toEqual(
			new Uint8Array(UPNG.encode(images, 32, 32, 0, [40, 40])),
		);
		expect(writePngFile(images.slice(0, 1), 32, 32, [])).toEqual(
			new Uint8Array(UPNG.encode(images.slice(0, 1), 32, 32, 0)),
		);
	});
});
