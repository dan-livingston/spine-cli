import type { Frame } from "#/encode/png.ts";
import type { Processes } from "#/ports/processes.ts";

export type VideoFormat = "mp4" | "webm";

export async function findFfmpeg(processes: Processes): Promise<string | null> {
	return (await processes.answersVersion("ffmpeg")) ? "ffmpeg" : null;
}

const PAD_TO_EVEN_SIZE = "pad=ceil(iw/2)*2:ceil(ih/2)*2";

const PAD_TO_EVEN_SIZE_TRANSPARENT = `${PAD_TO_EVEN_SIZE}:color=black@0`;

const CODEC_ARGS: Record<VideoFormat, string[]> = {
	mp4: ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", PAD_TO_EVEN_SIZE],
	webm: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-vf", PAD_TO_EVEN_SIZE_TRANSPARENT],
};

export async function encodeVideo(
	processes: Processes,
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

	await processes.run(
		ffmpeg,
		args,
		frames.map((frame) => frame.data),
	);
}
