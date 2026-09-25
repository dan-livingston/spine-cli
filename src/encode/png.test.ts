import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { encodePng, sequenceFileName, writePngSequence } from "#/encode/png.ts";
import { BLUE, CLEAR, RED, frameOf, solidFrame } from "#/test/encode-fixtures.ts";
import { readPng } from "#/test/encode-png-reader.ts";
import { FakeFiles } from "#/test/fake-files.ts";

async function decodePixels(bytes: Uint8Array) {
	const png = await readPng(bytes);
	return {
		width: png.width,
		height: png.height,
		frames: png.frames.length,
		pixels: png.shown[0],
	};
}

describe("encodePng", () => {
	it("round trips every pixel losslessly, alpha included", async () => {
		const frame = frameOf(3, 1, [RED, [10, 20, 30, 128], CLEAR]);
		expect(await decodePixels(encodePng(frame))).toEqual({
			width: 3,
			height: 1,
			frames: 1,
			pixels: [RED, [10, 20, 30, 128], CLEAR],
		});
	});

	it("keeps an image with many colours exact", async () => {
		const pixels = Array.from(
			{ length: 400 },
			(_, i) =>
				[i % 256, (i * 7) % 256, (i * 13) % 256, 255 - (i % 3)] as [
					number,
					number,
					number,
					number,
				],
		);
		expect((await decodePixels(encodePng(frameOf(20, 20, pixels)))).pixels).toEqual(pixels);
	});

	it("encodes a frame that is a view into a larger buffer", async () => {
		const backing = new Uint8Array(4 + 8);
		backing.set([...BLUE, ...RED, ...RED], 0);
		const frame = { width: 2, height: 1, data: backing.subarray(4, 12) };
		expect((await decodePixels(encodePng(frame))).pixels).toEqual([RED, RED]);
	});
});

describe("sequenceFileName", () => {
	it.each([
		[0, 1, "0001.png"],
		[9, 10, "0010.png"],
		[9998, 9999, "9999.png"],
		[0, 10000, "00001.png"],
		[9999, 10000, "10000.png"],
		[41, 123456, "000042.png"],
	])("names frame %i of %i as %s", (index, count, name) => {
		expect(sequenceFileName(index, count)).toBe(name);
	});

	it("sorts frames in play order by name", () => {
		const names = Array.from({ length: 12000 }, (_, i) => sequenceFileName(i, 12000));
		expect([...names].sort()).toEqual(names);
	});
});

describe("writePngSequence", () => {
	it("creates the folder and writes one numbered png per frame", async () => {
		const files = new FakeFiles();
		const dir = join("/out", "run");
		await writePngSequence(files, dir, [solidFrame(1, 1, RED), solidFrame(1, 1, BLUE)]);
		expect(files.hasDir("/out/run")).toBe(true);
		expect(files.filePaths()).toEqual(["/out/run/0001.png", "/out/run/0002.png"]);
		expect((await decodePixels(files.bytes("/out/run/0001.png"))).pixels).toEqual([RED]);
		expect((await decodePixels(files.bytes("/out/run/0002.png"))).pixels).toEqual([BLUE]);
	});

	it("writes nothing but the folder for an empty clip", async () => {
		const files = new FakeFiles();
		await writePngSequence(files, "/out/empty", []);
		expect(files.hasDir("/out/empty")).toBe(true);
		expect(files.filePaths()).toEqual([]);
	});
});
