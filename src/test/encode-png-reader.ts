import type { Rgba } from "#/test/encode-fixtures.ts";

import { CLEAR } from "#/test/encode-fixtures.ts";

export interface PngFrame {
	x: number;
	y: number;
	width: number;
	height: number;
	delayMs: number;
	dispose: number;
	blend: number;
	pixels: Rgba[];
}

export interface Png {
	width: number;
	height: number;
	plays: number | null;
	frames: PngFrame[];
	shown: Rgba[][];
}

interface Header {
	depth: number;
	colorType: number;
	palette: Rgba[];
	transparency: Uint8Array;
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u32(b: Uint8Array, at: number): number {
	return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function u16(b: Uint8Array, at: number): number {
	return (b[at] << 8) | b[at + 1];
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	if (pa <= pb && pa <= pc) return a;
	return pb <= pc ? b : c;
}

function unfilter(raw: Uint8Array, rowBytes: number, rows: number, step: number): Uint8Array {
	const out = new Uint8Array(rowBytes * rows);
	for (let y = 0; y < rows; y++) {
		const filter = raw[y * (rowBytes + 1)];
		for (let x = 0; x < rowBytes; x++) {
			const v = raw[y * (rowBytes + 1) + 1 + x];
			const a = x >= step ? out[y * rowBytes + x - step] : 0;
			const b = y > 0 ? out[(y - 1) * rowBytes + x] : 0;
			const c = x >= step && y > 0 ? out[(y - 1) * rowBytes + x - step] : 0;
			const predictors = [0, a, b, (a + b) >> 1, paeth(a, b, c)];
			out[y * rowBytes + x] = (v + predictors[filter]) & 0xff;
		}
	}
	return out;
}

function sample(row: Uint8Array, index: number, depth: number): number {
	const bit = index * depth;
	return (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
}

function toPixels(header: Header, data: Uint8Array, width: number, height: number): Rgba[] {
	const channels = CHANNELS[header.colorType];
	const rowBytes = Math.ceil((width * channels * header.depth) / 8);
	const step = Math.max(1, (channels * header.depth) >> 3);
	const bytes = unfilter(data, rowBytes, height, step);
	const pixels: Rgba[] = [];
	for (let y = 0; y < height; y++) {
		const row = bytes.subarray(y * rowBytes, (y + 1) * rowBytes);
		for (let x = 0; x < width; x++) {
			const s = (c: number) => sample(row, x * channels + c, header.depth);
			if (header.colorType === 3) {
				const i = s(0);
				const [r, g, b] = header.palette[i];
				pixels.push([
					r,
					g,
					b,
					i < header.transparency.length ? header.transparency[i] : 255,
				]);
			} else if (header.colorType === 6) pixels.push([s(0), s(1), s(2), s(3)]);
			else if (header.colorType === 2) pixels.push([s(0), s(1), s(2), 255]);
			else if (header.colorType === 4) pixels.push([s(0), s(0), s(0), s(1)]);
			else pixels.push([s(0), s(0), s(0), 255]);
		}
	}
	return pixels;
}

function over(src: Rgba, dst: Rgba): Rgba {
	if (src[3] === 255 || dst[3] === 0) return src;
	if (src[3] === 0) return dst;
	const sa = src[3] / 255;
	const da = (dst[3] / 255) * (1 - sa);
	const a = sa + da;
	const mix = (i: number) => Math.round((src[i] * sa + dst[i] * da) / a);
	return [mix(0), mix(1), mix(2), Math.round(a * 255)];
}

function compose(width: number, height: number, frames: PngFrame[]): Rgba[][] {
	let canvas: Rgba[] = Array.from({ length: width * height }, () => CLEAR);
	const shown: Rgba[][] = [];
	for (const f of frames) {
		const before = canvas.slice();
		const rect: number[] = [];
		f.pixels.forEach((px, i) => {
			const at = (f.y + Math.floor(i / f.width)) * width + f.x + (i % f.width);
			rect.push(at);
			canvas[at] = f.blend === 1 ? over(px, canvas[at]) : px;
		});
		shown.push(canvas.slice());
		if (f.dispose === 1) for (const at of rect) canvas[at] = CLEAR;
		if (f.dispose === 2) canvas = before;
	}
	return shown;
}

export async function readPng(bytes: Uint8Array): Promise<Png> {
	if (SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("not a png");
	const header: Header = { depth: 8, colorType: 6, palette: [], transparency: new Uint8Array() };
	let width = 0;
	let height = 0;
	let plays: number | null = null;
	const controls: Omit<PngFrame, "pixels">[] = [];
	const chunksOf: number[][] = [];
	for (let at = 8; at < bytes.length; ) {
		const length = u32(bytes, at);
		const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
		const body = bytes.subarray(at + 8, at + 8 + length);
		at += 12 + length;
		if (type === "IHDR") {
			width = u32(body, 0);
			height = u32(body, 4);
			header.depth = body[8];
			header.colorType = body[9];
		}
		if (type === "PLTE") {
			for (let i = 0; i < body.length; i += 3)
				header.palette.push([body[i], body[i + 1], body[i + 2], 255]);
		}
		if (type === "tRNS") header.transparency = body.slice();
		if (type === "acTL") plays = u32(body, 4);
		if (type === "fcTL") {
			const den = u16(body, 22) || 100;
			controls.push({
				width: u32(body, 4),
				height: u32(body, 8),
				x: u32(body, 12),
				y: u32(body, 16),
				delayMs: Math.round((u16(body, 20) * 1000) / den),
				dispose: body[24],
				blend: body[25],
			});
			chunksOf.push([]);
		}
		if (type === "IDAT" || type === "fdAT") {
			const data = type === "IDAT" ? body : body.subarray(4);
			if (chunksOf.length === 0) chunksOf.push([]);
			chunksOf[chunksOf.length - 1].push(...data);
		}
	}
	const still = { x: 0, y: 0, width, height, delayMs: 0, dispose: 0, blend: 0 };
	const frames: PngFrame[] = [];
	for (const [i, chunks] of chunksOf.entries()) {
		const control = controls[i] ?? still;
		const data = await inflate(Uint8Array.from(chunks));
		frames.push({ ...control, pixels: toPixels(header, data, control.width, control.height) });
	}
	return { width, height, plays, frames, shown: compose(width, height, frames) };
}
