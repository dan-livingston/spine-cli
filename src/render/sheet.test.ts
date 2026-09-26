import { describe, expect, it } from "vite-plus/test";

import type { Rgba } from "#/test/encode-fixtures.ts";

import { composeSheet, layoutSheet, sheetColumns } from "#/render/sheet.ts";
import { BLUE, CLEAR, RED, pixelsOf, solidFrame } from "#/test/encode-fixtures.ts";

const GREEN: Rgba = [0, 255, 0, 255];
const WHITE_BG = { r: 1, g: 1, b: 1, a: 1 };
const CLEAR_BG = { r: 0, g: 0, b: 0, a: 0 };
const W: Rgba = [255, 255, 255, 255];

describe("sheetColumns", () => {
	it("puts every frame in one row by default", () => {
		expect(sheetColumns(30, {})).toBe(30);
	});

	it("takes --columns as given and reduces it to the frame count", () => {
		expect(sheetColumns(30, { columns: 8 })).toBe(8);
		expect(sheetColumns(30, { columns: 999 })).toBe(30);
	});

	it("derives the columns from --rows, rounding up", () => {
		expect(sheetColumns(30, { rows: 2 })).toBe(15);
		expect(sheetColumns(10, { rows: 3 })).toBe(4);
		expect(sheetColumns(10, { rows: 1 })).toBe(10);
		expect(sheetColumns(10, { rows: 50 })).toBe(1);
	});
});

describe("layoutSheet", () => {
	it("lays one row of frames side by side", () => {
		expect(
			layoutSheet({ frameCount: 3, frameWidth: 4, frameHeight: 5, columns: 3, padding: 0 }),
		).toEqual({
			width: 12,
			height: 5,
			frameWidth: 4,
			frameHeight: 5,
			columns: 3,
			rows: 1,
			padding: 0,
			frames: [
				{ x: 0, y: 0, w: 4, h: 5 },
				{ x: 4, y: 0, w: 4, h: 5 },
				{ x: 8, y: 0, w: 4, h: 5 },
			],
		});
	});

	it("fills rows left to right then top to bottom, gapping cells by the padding", () => {
		const layout = layoutSheet({
			frameCount: 5,
			frameWidth: 4,
			frameHeight: 5,
			columns: 2,
			padding: 3,
		});
		expect(layout).toMatchObject({ width: 11, height: 21, columns: 2, rows: 3 });
		expect(layout.frames).toEqual([
			{ x: 0, y: 0, w: 4, h: 5 },
			{ x: 7, y: 0, w: 4, h: 5 },
			{ x: 0, y: 8, w: 4, h: 5 },
			{ x: 7, y: 8, w: 4, h: 5 },
			{ x: 0, y: 16, w: 4, h: 5 },
		]);
	});
});

describe("composeSheet", () => {
	it("places one row of frames in play order", () => {
		const frames = [solidFrame(1, 1, RED), solidFrame(1, 1, GREEN), solidFrame(1, 1, BLUE)];
		const layout = layoutSheet({
			frameCount: 3,
			frameWidth: 1,
			frameHeight: 1,
			columns: 3,
			padding: 0,
		});
		const sheet = composeSheet(frames, layout, CLEAR_BG);
		expect({ width: sheet.width, height: sheet.height }).toEqual({ width: 3, height: 1 });
		expect(pixelsOf(sheet.data)).toEqual([RED, GREEN, BLUE]);
	});

	it("wraps into rows and fills the rest of a partial last row with the background", () => {
		const frames = [solidFrame(1, 2, RED), solidFrame(1, 2, GREEN), solidFrame(1, 2, BLUE)];
		const layout = layoutSheet({
			frameCount: 3,
			frameWidth: 1,
			frameHeight: 2,
			columns: 2,
			padding: 0,
		});
		expect(pixelsOf(composeSheet(frames, layout, WHITE_BG).data)).toEqual([
			RED,
			GREEN,
			RED,
			GREEN,
			BLUE,
			W,
			BLUE,
			W,
		]);
	});

	it("fills the padding between cells with the background, transparent by default", () => {
		const frames = [solidFrame(1, 1, RED), solidFrame(1, 1, GREEN), solidFrame(1, 1, BLUE)];
		const layout = layoutSheet({
			frameCount: 3,
			frameWidth: 1,
			frameHeight: 1,
			columns: 2,
			padding: 1,
		});
		expect(pixelsOf(composeSheet(frames, layout, CLEAR_BG).data)).toEqual([
			RED,
			CLEAR,
			GREEN,
			CLEAR,
			CLEAR,
			CLEAR,
			BLUE,
			CLEAR,
			CLEAR,
		]);
		expect(pixelsOf(composeSheet(frames, layout, WHITE_BG).data)).toEqual([
			RED,
			W,
			GREEN,
			W,
			W,
			W,
			BLUE,
			W,
			W,
		]);
	});

	it("keeps each frame's rows intact inside its cell", () => {
		const frame = {
			width: 2,
			height: 2,
			data: Uint8Array.from([...RED, ...GREEN, ...BLUE, ...W]),
		};
		const layout = layoutSheet({
			frameCount: 2,
			frameWidth: 2,
			frameHeight: 2,
			columns: 2,
			padding: 0,
		});
		expect(pixelsOf(composeSheet([frame, frame], layout, CLEAR_BG).data)).toEqual([
			RED,
			GREEN,
			RED,
			GREEN,
			BLUE,
			W,
			BLUE,
			W,
		]);
	});
});
