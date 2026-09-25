import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import UPNG from "upng-js";

export const LOSSLESS_RGBA = 0;

export interface Frame {
	width: number;
	height: number;
	data: Uint8Array;
}

export function encodePng(frame: Frame): Uint8Array {
	const out = UPNG.encode([toArrayBuffer(frame.data)], frame.width, frame.height, LOSSLESS_RGBA);
	return new Uint8Array(out);
}

export async function writePngSequence(dir: string, frames: Frame[]): Promise<void> {
	await mkdir(dir, { recursive: true });
	await Promise.all(
		frames.map((frame, i) =>
			writeFile(join(dir, sequenceFileName(i, frames.length)), encodePng(frame)),
		),
	);
}

export function sequenceFileName(index: number, count: number): string {
	const digits = Math.max(4, String(count).length);
	return `${String(index + 1).padStart(digits, "0")}.png`;
}

export function toArrayBuffer(u: Uint8Array): ArrayBuffer {
	return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
