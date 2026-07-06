import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import UPNG from "upng-js";

// a raw rgba frame (top-down) plus its size.
export interface Frame {
	width: number;
	height: number;
	data: Uint8Array;
}

// lossless 32-bit png bytes for a single rgba frame.
export function encodePng(frame: Frame): Uint8Array {
	const out = UPNG.encode([toArrayBuffer(frame.data)], frame.width, frame.height, 0);
	return new Uint8Array(out);
}

// write NNNN.png (zero padded, 1-based) for each frame into dir.
export async function writePngSequence(dir: string, frames: Frame[]): Promise<void> {
	await mkdir(dir, { recursive: true });
	const pad = Math.max(4, String(frames.length).length);
	await Promise.all(
		frames.map((frame, i) => {
			const name = `${String(i + 1).padStart(pad, "0")}.png`;
			return writeFile(join(dir, name), encodePng(frame));
		}),
	);
}

// upng needs an ArrayBuffer; hand it a tight copy of the frame bytes.
export function toArrayBuffer(u: Uint8Array): ArrayBuffer {
	return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
