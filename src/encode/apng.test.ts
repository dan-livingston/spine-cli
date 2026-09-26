import { describe, expect, it } from "vite-plus/test";

import type { Rgba } from "#/test/encode-fixtures.ts";

import { encodeApng } from "#/encode/apng.ts";
import { BLUE, CLEAR, RED, frameOf, pixelsOf, solidFrame } from "#/test/encode-fixtures.ts";
import { readPng } from "#/test/encode-png-reader.ts";

const GREEN_HALF: Rgba = [0, 255, 0, 100];

function patterned(size: number, colours: Rgba[]) {
	return frameOf(
		size,
		size,
		Array.from({ length: size * size }, (_, i) => colours[i % colours.length]),
	);
}

describe("encodeApng", () => {
	it("rejects an empty clip", () => {
		expect(() => encodeApng([], 30)).toThrow("no frames to encode");
	});

	it("shows every frame exactly, alpha included, looping forever", async () => {
		const frames = [
			patterned(8, [RED, CLEAR, CLEAR, BLUE]),
			patterned(8, [CLEAR, GREEN_HALF, RED]),
			patterned(8, [CLEAR, GREEN_HALF, RED]),
			patterned(8, [BLUE, GREEN_HALF, CLEAR, CLEAR, CLEAR]),
		];
		const apng = await readPng(encodeApng(frames, 30));
		expect(apng.width).toBe(8);
		expect(apng.height).toBe(8);
		expect(apng.plays).toBe(0);
		expect(apng.shown).toEqual(frames.map((f) => pixelsOf(f.data)));
	});

	it("clears an opaque frame where the next frame is transparent", async () => {
		const frames = [solidFrame(8, 8, RED), patterned(8, [CLEAR, BLUE])];
		expect((await readPng(encodeApng(frames, 12))).shown[1]).toEqual(pixelsOf(frames[1].data));
	});

	it.each([
		[30, 33],
		[24, 42],
		[60, 17],
		[1, 1000],
		[5000, 1],
	])("at %i fps shows each frame for %i ms", async (fps, ms) => {
		const frames = [solidFrame(8, 8, RED), solidFrame(8, 8, BLUE), solidFrame(8, 8, RED)];
		const apng = await readPng(encodeApng(frames, fps));
		expect(apng.frames.map((f) => f.delayMs)).toEqual([ms, ms, ms]);
	});

	it("writes frames of a few pixels whole, ending in IEND", async () => {
		const frames = [solidFrame(2, 2, RED), solidFrame(2, 2, BLUE)];
		const bytes = encodeApng(frames, 30);
		expect(Array.from(bytes.subarray(-8, -4))).toEqual([73, 69, 78, 68]);
		const apng = await readPng(bytes);
		expect(apng.shown).toEqual(frames.map((f) => pixelsOf(f.data)));
	});
});
