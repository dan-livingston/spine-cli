import { describe, expect, it } from "vite-plus/test";

import type { RenderRequest } from "#/render/harness/contract.ts";

import { containBoxInView, renderFrame, sizeCanvas } from "#/render/harness/draw.ts";
import { decodeFrame, stubSession } from "#/test/harness-fixtures.ts";

function request(background: RenderRequest["background"]): RenderRequest {
	return { animation: "idle", fps: 30, duration: 0, loops: 1, fit: "declared", background };
}

const transparent = { r: 0, g: 0, b: 0, a: 0 };

function bottomUpRows(w: number, h: number): Uint8Array {
	const buf = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) buf.set([y, x, 0, 255], (y * w + x) * 4);
	}
	return buf;
}

function pixelAt(frame: number[], w: number, x: number, y: number): number[] {
	const i = (y * w + x) * 4;
	return frame.slice(i, i + 4);
}

describe("sizeCanvas", () => {
	it("resizes the canvas and the gl viewport", () => {
		const { session, canvas, records } = stubSession();
		sizeCanvas(session, 320, 180);
		expect(canvas).toEqual({ width: 320, height: 180 });
		expect(records.viewport).toEqual({ w: 320, h: 180 });
	});
});

describe("containBoxInView", () => {
	it("centres the camera on the box", () => {
		const { session, camera } = stubSession();
		containBoxInView(session, { x: -50, y: 10, width: 100, height: 200 }, 100, 200);
		expect(camera.position).toEqual({ x: 0, y: 110 });
		expect(camera.viewport).toEqual({ w: 100, h: 200 });
		expect(camera.zoom).toBe(1);
	});

	it("zooms so the whole box fits when the output ratio differs", () => {
		const { session, camera } = stubSession();
		containBoxInView(session, { x: 0, y: 0, width: 400, height: 100 }, 100, 100);
		expect(camera.zoom).toBe(4);
		containBoxInView(session, { x: 0, y: 0, width: 100, height: 400 }, 200, 100);
		expect(camera.zoom).toBe(4);
	});

	it("keeps a usable zoom for an empty box", () => {
		const { session, camera } = stubSession();
		containBoxInView(session, { x: 5, y: 5, width: 0, height: 0 }, 10, 10);
		expect(camera.zoom).toBe(1);
		expect(camera.position).toEqual({ x: 5, y: 5 });
	});
});

describe("renderFrame", () => {
	it("returns w*h rgba bytes with the first row at the top", () => {
		const { session } = stubSession({ pixels: bottomUpRows });
		const frame = decodeFrame(renderFrame(session, 3, 3, request(transparent)));
		expect(frame).toHaveLength(3 * 3 * 4);
		expect(pixelAt(frame, 3, 0, 0)).toEqual([2, 0, 0, 255]);
		expect(pixelAt(frame, 3, 2, 1)).toEqual([1, 2, 0, 255]);
		expect(pixelAt(frame, 3, 1, 2)).toEqual([0, 1, 0, 255]);
	});

	it("flips an even number of rows", () => {
		const { session } = stubSession({ pixels: bottomUpRows });
		const frame = decodeFrame(renderFrame(session, 2, 4, request(transparent)));
		expect([0, 1, 2, 3].map((y) => pixelAt(frame, 2, 0, y)[0])).toEqual([3, 2, 1, 0]);
	});

	it("clears to the requested background", () => {
		const { session, records } = stubSession();
		const frame = decodeFrame(
			renderFrame(session, 1, 1, request({ r: 1, g: 0.5, b: 0, a: 1 })),
		);
		expect(records.clearColor).toEqual([1, 0.5, 0, 1]);
		expect(frame).toEqual([255, 128, 0, 255]);
	});

	it("turns premultiplied pixels back into straight alpha", () => {
		const { session } = stubSession({
			premultiplied: true,
			pixels: () =>
				new Uint8Array([64, 32, 0, 128, 10, 20, 30, 0, 200, 100, 50, 255, 200, 50, 0, 100]),
		});
		const frame = decodeFrame(renderFrame(session, 4, 1, request(transparent)));
		expect(frame).toEqual([
			128, 64, 0, 128, 10, 20, 30, 0, 200, 100, 50, 255, 255, 128, 0, 100,
		]);
	});

	it("leaves straight-alpha pixels alone", () => {
		const { session } = stubSession({
			premultiplied: false,
			pixels: () => new Uint8Array([64, 32, 0, 128]),
		});
		expect(decodeFrame(renderFrame(session, 1, 1, request(transparent)))).toEqual([
			64, 32, 0, 128,
		]);
	});

	it("premultiplies a translucent background on a premultiplied atlas so it reads back unchanged", () => {
		const { session } = stubSession({ premultiplied: true });
		const frame = decodeFrame(
			renderFrame(session, 1, 1, request({ r: 0.5, g: 0.5, b: 0.5, a: 0.5 })),
		);
		expect(frame).toEqual([128, 128, 128, 128]);
	});

	it("encodes large frames byte for byte across chunks", () => {
		const width = 60000;
		const bytes = Uint8Array.from({ length: width * 4 }, (_, i) => i % 251);
		const { session } = stubSession({ pixels: () => bytes });
		const frame = decodeFrame(renderFrame(session, width, 1, request(transparent)));
		expect(frame).toEqual(Array.from(bytes));
	});
});
