import { join } from "node:path";

import type { Frame } from "#/encode/png.ts";
import type { Io } from "#/ports/env.ts";
import type { Files } from "#/ports/files.ts";

import { encodePng, sequenceFileName } from "#/encode/png.ts";

const LOOP_FOREVER = ["-loop", "0"];

const EVERY_FRAME_A_KEY_FRAME = ["-kmax", "0"];

export async function encodeWebp(
	io: Io,
	img2webp: string,
	out: string,
	frames: Frame[],
	fps: number,
	lossyQuality?: number,
): Promise<void> {
	if (frames.length === 0) throw new Error("no frames to encode");
	const delayMs = String(Math.max(1, Math.round(1000 / fps)));
	const dir = await io.files.makeTempDir("spine-webp-");
	try {
		const files = await writeFrameFiles(io.files, dir, frames);
		const compression =
			lossyQuality === undefined ? ["-lossless"] : ["-lossy", "-q", String(lossyQuality)];
		const eachFrameWithItsOwnOptions = files.flatMap((file) => [
			...compression,
			"-d",
			delayMs,
			file,
		]);
		await io.processes.run(img2webp, [
			...LOOP_FOREVER,
			...EVERY_FRAME_A_KEY_FRAME,
			...eachFrameWithItsOwnOptions,
			"-o",
			out,
		]);
	} finally {
		await io.files.remove(dir);
	}
}

async function writeFrameFiles(files: Files, dir: string, frames: Frame[]): Promise<string[]> {
	const paths = frames.map((_, i) => join(dir, sequenceFileName(i, frames.length)));
	await Promise.all(frames.map((frame, i) => files.write(paths[i], encodePng(frame))));
	return paths;
}
