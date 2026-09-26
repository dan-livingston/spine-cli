import { describe, expect, it, vi } from "vite-plus/test";

import { encodeGif } from "#/encode/gif.ts";
import {
	BLUE,
	CLEAR,
	RED,
	composeGif,
	frameOf,
	parseGif,
	solidFrame,
} from "#/test/encode-fixtures.ts";

vi.mock("gifenc", async (importOriginal) => {
	const namespace = await importOriginal<Record<string, unknown>>();
	return { ...namespace, default: namespace };
});

describe("encodeGif", () => {
	it("rejects an empty clip", () => {
		expect(() => encodeGif([], 30)).toThrow("no frames to encode");
	});

	it("encodes every frame at the clip size and loops forever", () => {
		const gif = parseGif(encodeGif([solidFrame(3, 2, RED), solidFrame(3, 2, BLUE)], 10));
		expect(gif.width).toBe(3);
		expect(gif.height).toBe(2);
		expect(gif.loopCount).toBe(0);
		expect(gif.frames).toHaveLength(2);
		expect(composeGif(gif)).toEqual([
			Array.from({ length: 6 }, () => RED),
			Array.from({ length: 6 }, () => BLUE),
		]);
	});

	it("keeps fully transparent pixels transparent", () => {
		const frame = frameOf(2, 2, [RED, CLEAR, CLEAR, BLUE]);
		const [shown] = composeGif(parseGif(encodeGif([frame], 30)));
		expect(shown).toEqual([RED, CLEAR, CLEAR, BLUE]);
	});

	it("drops half transparent pixels to one bit alpha", () => {
		const frame = frameOf(2, 1, [
			[255, 0, 0, 200],
			[0, 0, 255, 40],
		]);
		const [shown] = composeGif(parseGif(encodeGif([frame], 30)));
		expect(shown).toEqual([RED, CLEAR]);
	});

	it("clears transparent frames before the next one so they do not smear", () => {
		const first = frameOf(2, 1, [RED, CLEAR]);
		const second = frameOf(2, 1, [CLEAR, BLUE]);
		const shown = composeGif(parseGif(encodeGif([first, second], 30)));
		expect(shown[1]).toEqual([CLEAR, BLUE]);
	});

	it("clears an opaque frame too, so it does not show through the next frame", () => {
		const opaque = solidFrame(2, 1, RED);
		const partly = frameOf(2, 1, [CLEAR, BLUE]);
		const shown = composeGif(parseGif(encodeGif([opaque, partly], 30)));
		expect(shown[1]).toEqual([CLEAR, BLUE]);
	});

	it.each([
		[30, 3],
		[10, 10],
		[1, 100],
		[100, 1],
		[1000, 1],
	])("at %i fps gives each frame %i hundredths of a second", (fps, delayCs) => {
		const gif = parseGif(encodeGif([solidFrame(1, 1, RED), solidFrame(1, 1, BLUE)], fps));
		expect(gif.frames.map((f) => f.delayCs)).toEqual([delayCs, delayCs]);
	});
});
