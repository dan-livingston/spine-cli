import { spawn } from "node:child_process";

import type { Frame } from "#/encode/png.ts";

export type VideoFormat = "mp4" | "webm";

export async function findFfmpeg(): Promise<string | null> {
	const ok = await probe("ffmpeg");
	return ok ? "ffmpeg" : null;
}

function probe(bin: string): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(bin, ["-version"], { stdio: "ignore" });
		child.on("error", () => resolve(false));
		child.on("close", (code) => resolve(code === 0));
	});
}

const PAD_TO_EVEN_SIZE = "pad=ceil(iw/2)*2:ceil(ih/2)*2";

const CODEC_ARGS: Record<VideoFormat, string[]> = {
	mp4: ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", PAD_TO_EVEN_SIZE],
	webm: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-vf", PAD_TO_EVEN_SIZE],
};

export async function encodeVideo(
	ffmpeg: string,
	out: string,
	frames: Frame[],
	fps: number,
	format: VideoFormat,
): Promise<void> {
	if (frames.length === 0) throw new Error("no frames to encode");
	const { width, height } = frames[0];

	const args = [
		"-y",
		"-f",
		"rawvideo",
		"-pix_fmt",
		"rgba",
		"-s",
		`${width}x${height}`,
		"-r",
		String(fps),
		"-i",
		"-",
		...CODEC_ARGS[format],
		"-r",
		String(fps),
		out,
	];

	await new Promise<void>((resolve, reject) => {
		const child = spawn(ffmpeg, args, { stdio: ["pipe", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (d) => {
			stderr += String(d);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
		});
		void pipeFrames(child.stdin, frames).catch(reject);
	});
}

async function pipeFrames(stdin: NodeJS.WritableStream, frames: Frame[]): Promise<void> {
	for (const frame of frames) {
		if (!stdin.write(frame.data)) {
			await new Promise<void>((resolve) => stdin.once("drain", resolve));
		}
	}
	stdin.end();
}
