import { join } from "node:path";

import type { Files } from "#/ports/files.ts";

import { writePngFile } from "#/encode/png-file.ts";

export interface Frame {
	width: number;
	height: number;
	data: Uint8Array;
}

export function encodePng(frame: Frame): Uint8Array {
	return writePngFile([toArrayBuffer(frame.data)], frame.width, frame.height, []);
}

export async function writePngSequence(files: Files, dir: string, frames: Frame[]): Promise<void> {
	await files.makeDir(dir);
	await Promise.all(
		frames.map((frame, i) =>
			files.write(join(dir, sequenceFileName(i, frames.length)), encodePng(frame)),
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
