import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Frame } from "./png.ts";

import { encodePng } from "./png.ts";

// resolve img2webp (a libwebp tool) on PATH. animated webp needs it: ffmpeg's
// libwebp encoder blends every frame over the previous one with no disposal
// control, so moving semi-transparent pixels never clear and smear a trail.
export async function findImg2webp(): Promise<string | null> {
	return (await probe("img2webp")) ? "img2webp" : null;
}

function probe(bin: string): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn(bin, ["-version"], { stdio: "ignore" });
		child.on("error", () => resolve(false));
		child.on("close", (code) => resolve(code === 0));
	});
}

// animated webp from rgba frames via img2webp. -kmax 0 makes every frame a key
// frame so nothing blends across frames and transparency stays exact. lossless
// by default; a quality (0-100) switches to lossy. img2webp reads files, not a
// pipe, so frames go to a temp dir that is removed afterwards.
export async function encodeWebp(
	img2webp: string,
	out: string,
	frames: Frame[],
	fps: number,
	// 0-100 lossy quality; undefined means lossless.
	quality?: number,
): Promise<void> {
	if (frames.length === 0) throw new Error("no frames to encode");
	const delay = String(Math.max(1, Math.round(1000 / fps)));
	const dir = await mkdtemp(join(tmpdir(), "spine-webp-"));
	try {
		const pad = Math.max(4, String(frames.length).length);
		const files = frames.map((_, i) => join(dir, `${String(i).padStart(pad, "0")}.png`));
		await Promise.all(frames.map((frame, i) => writeFile(files[i], encodePng(frame))));

		// per-frame options precede each frame file; repeat them so none rely on
		// carry-over. mode is lossless unless a quality was given.
		const mode = quality === undefined ? ["-lossless"] : ["-lossy", "-q", String(quality)];
		const perFrame = files.flatMap((file) => [...mode, "-d", delay, file]);
		const args = ["-loop", "0", "-kmax", "0", ...perFrame, "-o", out];
		await run(img2webp, args);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function run(bin: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (d) => {
			stderr += String(d);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`img2webp exited ${code}: ${stderr.slice(-500)}`));
		});
	});
}
