import UPNG from "upng-js";

import type { Frame } from "./png.ts";

import { toArrayBuffer } from "./png.ts";

// animated png from rgba frames. one delay (ms) per frame from fps. lossless
// 32-bit so alpha survives.
export function encodeApng(frames: Frame[], fps: number): Uint8Array {
	if (frames.length === 0) throw new Error("no frames to encode");
	const { width, height } = frames[0];
	const delay = Math.max(1, Math.round(1000 / fps));
	const dels = frames.map(() => delay);
	const bufs = frames.map((f) => toArrayBuffer(f.data));
	const out = UPNG.encode(bufs, width, height, 0, dels);
	return new Uint8Array(out);
}
