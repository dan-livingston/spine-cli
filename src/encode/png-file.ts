import UPNG from "upng-js";

interface CompressedFrame {
	rect: { x: number; y: number; width: number; height: number };
	cimg: Uint8Array;
	dispose: number;
	blend: number;
}

interface CompressedPng {
	ctype: number;
	depth: number;
	plte: number[];
	gotAlpha: boolean;
	frames: CompressedFrame[];
}

interface UpngInternals {
	encode: {
		compressPNG(
			bufs: ArrayBuffer[],
			w: number,
			h: number,
			colors: number,
			forbidPlte: boolean,
		): CompressedPng;
	};
	crc: { crc(bytes: Uint8Array, offset: number, length: number): number };
}

const upng = UPNG as unknown as UpngInternals;

const LOSSLESS = 0;

const INDEXED_COLOR = 3;

const SRGB_RELATIVE_COLORIMETRIC = 1;

const MS_PER_SECOND = 1000;

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export function writePngFile(
	images: ArrayBuffer[],
	width: number,
	height: number,
	delaysMs: number[],
): Uint8Array {
	const png = upng.encode.compressPNG(images, width, height, LOSSLESS, false);
	const animated = images.length > 1;
	const chunks = [
		SIGNATURE,
		chunk("IHDR", concat(uint32s(width, height), Uint8Array.of(png.depth, png.ctype, 0, 0, 0))),
		chunk("sRGB", Uint8Array.of(SRGB_RELATIVE_COLORIMETRIC)),
	];
	if (animated) chunks.push(chunk("acTL", uint32s(images.length, 0)));
	if (png.ctype === INDEXED_COLOR) chunks.push(...paletteChunks(png));
	let sequence = 0;
	png.frames.forEach((frame, i) => {
		if (animated) chunks.push(chunk("fcTL", frameControl(sequence++, frame, delaysMs[i])));
		chunks.push(
			i === 0
				? chunk("IDAT", frame.cimg)
				: chunk("fdAT", concat(uint32s(sequence++), frame.cimg)),
		);
	});
	chunks.push(chunk("IEND", new Uint8Array()));
	return concat(...chunks);
}

function paletteChunks(png: CompressedPng): Uint8Array[] {
	const rgb = Uint8Array.from(
		png.plte.flatMap((c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255]),
	);
	const plte = chunk("PLTE", rgb);
	if (!png.gotAlpha) return [plte];
	return [plte, chunk("tRNS", Uint8Array.from(png.plte.map((c) => (c >>> 24) & 255)))];
}

function frameControl(sequence: number, frame: CompressedFrame, delayMs: number): Uint8Array {
	const { x, y, width, height } = frame.rect;
	const timing = new Uint8Array(4);
	const view = new DataView(timing.buffer);
	view.setUint16(0, delayMs);
	view.setUint16(2, MS_PER_SECOND);
	return concat(
		uint32s(sequence, width, height, x, y),
		timing,
		Uint8Array.of(frame.dispose, frame.blend),
	);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const typed = concat(new TextEncoder().encode(type), data);
	return concat(uint32s(data.length), typed, uint32s(upng.crc.crc(typed, 0, typed.length) >>> 0));
}

function uint32s(...values: number[]): Uint8Array {
	const bytes = new Uint8Array(values.length * 4);
	const view = new DataView(bytes.buffer);
	values.forEach((v, i) => view.setUint32(i * 4, v));
	return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}
