import type { Frame } from "#/encode/png.ts";
import type { Processes } from "#/ports/processes.ts";
import type { Rgba } from "#/render/harness/contract.ts";

export type VideoFormat = "mp4" | "webm";

export async function findFfmpeg(processes: Processes): Promise<string | null> {
	return (await processes.answersVersion("ffmpeg")) ? "ffmpeg" : null;
}

const CODEC_ARGS: Record<VideoFormat, string[]> = {
	mp4: ["-c:v", "libx264", "-pix_fmt", "yuv420p"],
	webm: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p"],
};

export interface VideoOptions {
	fps: number;
	format: VideoFormat;
	background: Rgba;
}

export async function encodeVideo(
	processes: Processes,
	ffmpeg: string,
	out: string,
	frames: Frame[],
	{ fps, format, background }: VideoOptions,
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
		"-vf",
		padToEvenSize(background),
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

function padToEvenSize(background: Rgba): string {
	return `pad=ceil(iw/2)*2:ceil(ih/2)*2:color=${ffmpegColor(background)}`;
}

function ffmpegColor({ r, g, b, a }: Rgba): string {
	const hex = [r, g, b]
		.map((c) =>
			Math.round(c * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("");
	return `0x${hex}@${a}`;
}
