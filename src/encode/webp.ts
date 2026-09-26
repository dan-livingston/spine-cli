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
	await withFrameFiles(io.files, frames, async (files) => {
		const eachFrameWithItsOwnOptions = files.flatMap((file) => [
			...compression(lossyQuality),
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
	});
}

export async function encodeWebpStill(
	io: Io,
	cwebp: string,
	out: string,
	frame: Frame,
	lossyQuality?: number,
): Promise<void> {
	const quality = lossyQuality === undefined ? ["-lossless"] : ["-q", String(lossyQuality)];
	await withFrameFiles(io.files, [frame], async ([file]) => {
		await io.processes.run(cwebp, ["-quiet", ...quality, file, "-o", out]);
	});
}

function compression(lossyQuality: number | undefined): string[] {
	return lossyQuality === undefined ? ["-lossless"] : ["-lossy", "-q", String(lossyQuality)];
}

async function withFrameFiles(
	files: Files,
	frames: Frame[],
	use: (paths: string[]) => Promise<void>,
): Promise<void> {
	const dir = await files.makeTempDir("spine-webp-");
	try {
		const paths = frames.map((_, i) => join(dir, sequenceFileName(i, frames.length)));
		await Promise.all(frames.map((frame, i) => files.write(paths[i], encodePng(frame))));
		await use(paths);
	} finally {
		await files.remove(dir);
	}
}
