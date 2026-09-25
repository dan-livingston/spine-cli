import { dirname } from "node:path";

import type { Frame } from "#/encode/png.ts";
import type { Io } from "#/ports/env.ts";
import type { Clip } from "#/ports/render-pool.ts";
import type { Job } from "#/render/plan.ts";
import type { RunParams } from "#/render/requests.ts";

import { encodeApng } from "#/encode/apng.ts";
import { encodeGif } from "#/encode/gif.ts";
import { encodePng, writePngSequence } from "#/encode/png.ts";
import { encodeVideo } from "#/encode/video.ts";
import { encodeWebp } from "#/encode/webp.ts";

export async function writeClip(io: Io, job: Job, clip: Clip, params: RunParams): Promise<void> {
	const frames = toFrames(clip);
	const path = job.target.path;
	if (params.format === "pngseq") {
		await writePngSequence(io.files, path, frames);
		return;
	}

	await io.files.makeDir(dirname(path));
	if (params.format === "png") {
		await io.files.write(path, encodePng(frames[0]));
	} else if (params.format === "apng") {
		await io.files.write(path, encodeApng(frames, params.fps));
	} else if (params.format === "gif") {
		await io.files.write(path, encodeGif(frames, params.fps));
	} else if (params.format === "mp4" || params.format === "webm") {
		if (!params.ffmpeg) throw new Error("ffmpeg unavailable");
		await encodeVideo(io.processes, params.ffmpeg, path, frames, params.fps, params.format);
	} else if (params.format === "webp") {
		if (!params.img2webp) throw new Error("img2webp unavailable");
		await encodeWebp(io, params.img2webp, path, frames, params.fps, params.lossyQuality);
	}
}

function toFrames(clip: Clip): Frame[] {
	return clip.frames.map((data) => ({ width: clip.width, height: clip.height, data }));
}
