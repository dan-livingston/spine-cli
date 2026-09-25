import type { Frame } from "#/encode/png.ts";

export type Rgba = [number, number, number, number];

export const RED: Rgba = [255, 0, 0, 255];
export const BLUE: Rgba = [0, 0, 255, 255];
export const CLEAR: Rgba = [0, 0, 0, 0];

export function frameOf(width: number, height: number, pixels: Rgba[]): Frame {
	const data = new Uint8Array(width * height * 4);
	pixels.forEach((px, i) => data.set(px, i * 4));
	return { width, height, data };
}

export function solidFrame(width: number, height: number, color: Rgba): Frame {
	return frameOf(
		width,
		height,
		Array.from({ length: width * height }, () => color),
	);
}

export function pixelsOf(data: Uint8Array): Rgba[] {
	const out: Rgba[] = [];
	for (let i = 0; i < data.length; i += 4) {
		out.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
	}
	return out;
}

export interface GifFrame {
	left: number;
	top: number;
	width: number;
	height: number;
	delayCs: number;
	disposal: number;
	transparentIndex: number | null;
	palette: Rgba[];
	indices: number[];
}

export interface Gif {
	width: number;
	height: number;
	loopCount: number | null;
	frames: GifFrame[];
}

class Reader {
	pos = 0;

	constructor(private readonly bytes: Uint8Array) {}

	u8(): number {
		return this.bytes[this.pos++];
	}

	u16(): number {
		const v = this.bytes[this.pos] | (this.bytes[this.pos + 1] << 8);
		this.pos += 2;
		return v;
	}

	take(n: number): Uint8Array {
		const out = this.bytes.slice(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}

	subBlocks(): number[] {
		const out: number[] = [];
		for (let size = this.u8(); size > 0; size = this.u8()) out.push(...this.take(size));
		return out;
	}

	colorTable(packed: number): Rgba[] {
		if ((packed & 0x80) === 0) return [];
		const count = 2 << (packed & 7);
		return Array.from({ length: count }, () => [this.u8(), this.u8(), this.u8(), 255] as Rgba);
	}
}

function lzwDecode(minSize: number, data: number[]): number[] {
	const clear = 1 << minSize;
	const end = clear + 1;
	const fresh = (): number[][] => [...Array.from({ length: clear }, (_, i) => [i]), [], []];
	let dict = fresh();
	let size = minSize + 1;
	let prev: number[] | null = null;
	let bitPos = 0;
	const out: number[] = [];
	while (bitPos + size <= data.length * 8) {
		let code = 0;
		for (let b = 0; b < size; b++, bitPos++) {
			code |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << b;
		}
		if (code === clear) {
			dict = fresh();
			size = minSize + 1;
			prev = null;
			continue;
		}
		if (code === end) break;
		const entry: number[] = code < dict.length ? dict[code] : prev ? [...prev, prev[0]] : [];
		out.push(...entry);
		if (prev) {
			dict.push([...prev, entry[0]]);
			if (dict.length === 1 << size && size < 12) size++;
		}
		prev = entry;
	}
	return out;
}

export function parseGif(bytes: Uint8Array): Gif {
	const r = new Reader(bytes);
	const signature = String.fromCharCode(...r.take(6));
	if (signature !== "GIF89a" && signature !== "GIF87a") throw new Error("not a gif");
	const width = r.u16();
	const height = r.u16();
	const packed = r.u8();
	r.take(2);
	const global = r.colorTable(packed);
	const gif: Gif = { width, height, loopCount: null, frames: [] };
	let control = { delayCs: 0, disposal: 0, transparentIndex: null as number | null };
	for (let block = r.u8(); block !== 0x3b; block = r.u8()) {
		if (block === 0x21) {
			const label = r.u8();
			const body = r.subBlocks();
			if (label === 0xf9) {
				control = {
					disposal: (body[0] >> 2) & 7,
					delayCs: body[1] | (body[2] << 8),
					transparentIndex: body[0] & 1 ? body[3] : null,
				};
			}
			if (label === 0xff && String.fromCharCode(...body.slice(0, 11)) === "NETSCAPE2.0") {
				gif.loopCount = body[12] | (body[13] << 8);
			}
			continue;
		}
		if (block !== 0x2c) throw new Error(`unexpected gif block ${block}`);
		const left = r.u16();
		const top = r.u16();
		const w = r.u16();
		const h = r.u16();
		const local = r.colorTable(r.u8());
		const minSize = r.u8();
		const indices = lzwDecode(minSize, r.subBlocks()).slice(0, w * h);
		const palette = local.length > 0 ? local : global;
		gif.frames.push({ left, top, width: w, height: h, ...control, palette, indices });
		control = { delayCs: 0, disposal: 0, transparentIndex: null };
	}
	return gif;
}

export function composeGif(gif: Gif): Rgba[][] {
	let canvas: Rgba[] = Array.from({ length: gif.width * gif.height }, () => CLEAR);
	const shown: Rgba[][] = [];
	for (const f of gif.frames) {
		const before = canvas.slice();
		const inRect: number[] = [];
		f.indices.forEach((index, i) => {
			const at = (f.top + Math.floor(i / f.width)) * gif.width + f.left + (i % f.width);
			inRect.push(at);
			if (index !== f.transparentIndex) canvas[at] = f.palette[index];
		});
		shown.push(canvas.slice());
		if (f.disposal === 2) for (const at of inRect) canvas[at] = CLEAR;
		if (f.disposal === 3) canvas = before;
	}
	return shown;
}
