import type { Processes } from "#/ports/processes.ts";
import type { Format } from "#/render/output-path.ts";

import { findFfmpeg } from "#/encode/video.ts";
import { findImg2webp } from "#/encode/webp.ts";

export async function findExternalEncoders(
	processes: Processes,
	format: Format,
): Promise<{ ffmpeg: string | null; img2webp: string | null }> {
	if (format === "mp4" || format === "webm") {
		const ffmpeg = await findFfmpeg(processes);
		if (!ffmpeg) {
			throw new Error(
				`ffmpeg not found on PATH; install ffmpeg to render ${format}. pngseq, png, gif and apng work without it`,
			);
		}
		return { ffmpeg, img2webp: null };
	}
	if (format === "webp") {
		const img2webp = await findImg2webp(processes);
		if (!img2webp) {
			throw new Error(
				"img2webp not found on PATH; install libwebp to render webp. pngseq, png, gif and apng work without it",
			);
		}
		return { ffmpeg: null, img2webp };
	}
	return { ffmpeg: null, img2webp: null };
}
