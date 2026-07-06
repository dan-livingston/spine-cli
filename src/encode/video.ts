import { spawn } from "node:child_process";

import type { Frame } from "./png.ts";

export type VideoFormat = "mp4" | "webm";

// resolve an ffmpeg to drive. only a real ffmpeg on PATH is used; the build
// bundled with playwright is stripped (no rawvideo/x264) and not suitable.
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

// encode rgba frames to an mp4/webm file by piping rawvideo to ffmpeg. mp4 has
// no alpha (yuv420p); webm keeps alpha via vp9/yuva420p. dimensions are padded to
// even numbers as these codecs require. animated webp does not go through here:
// ffmpeg's libwebp blends frames with no disposal control, so it lives in
// encode/webp.ts via img2webp instead.
export async function encodeVideo(
	ffmpeg: string,
	out: string,
	frames: Frame[],
	fps: number,
	format: VideoFormat,
): Promise<void> {
	if (frames.length === 0) throw new Error("no frames to encode");
	const { width, height } = frames[0];

	const pad = "pad=ceil(iw/2)*2:ceil(ih/2)*2";
	const codec =
		format === "mp4"
			? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", pad]
			: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-vf", pad];

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
		...codec,
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

// write frames to ffmpeg stdin, respecting backpressure.
async function pipeFrames(stdin: NodeJS.WritableStream, frames: Frame[]): Promise<void> {
	for (const frame of frames) {
		if (!stdin.write(frame.data)) {
			await new Promise<void>((resolve) => stdin.once("drain", resolve));
		}
	}
	stdin.end();
}
