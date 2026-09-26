import type { Frame } from "#/encode/png.ts";

import { writePngFile } from "#/encode/png-file.ts";
import { toArrayBuffer } from "#/encode/png.ts";

export function encodeApng(frames: Frame[], fps: number): Uint8Array {
	if (frames.length === 0) throw new Error("no frames to encode");
	const { width, height } = frames[0];
	const delayMs = Math.max(1, Math.round(1000 / fps));
	const delaysMs = frames.map(() => delayMs);
	return writePngFile(
		frames.map((f) => toArrayBuffer(f.data)),
		width,
		height,
		delaysMs,
	);
}
