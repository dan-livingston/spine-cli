import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Frame } from "#/encode/png.ts";

import { encodePng, sequenceFileName } from "#/encode/png.ts";

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

const LOOP_FOREVER = ["-loop", "0"];

const EVERY_FRAME_A_KEY_FRAME = ["-kmax", "0"];

export async function encodeWebp(
	img2webp: string,
	out: string,
	frames: Frame[],
	fps: number,
	lossyQuality?: number,
): Promise<void> {
	if (frames.length === 0) throw new Error("no frames to encode");
	const delayMs = String(Math.max(1, Math.round(1000 / fps)));
	const dir = await mkdtemp(join(tmpdir(), "spine-webp-"));
	try {
		const files = await writeFrameFiles(dir, frames);
		const compression =
			lossyQuality === undefined ? ["-lossless"] : ["-lossy", "-q", String(lossyQuality)];
		const eachFrameWithItsOwnOptions = files.flatMap((file) => [
			...compression,
			"-d",
			delayMs,
			file,
		]);
		await run(img2webp, [
			...LOOP_FOREVER,
			...EVERY_FRAME_A_KEY_FRAME,
			...eachFrameWithItsOwnOptions,
			"-o",
			out,
		]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function writeFrameFiles(dir: string, frames: Frame[]): Promise<string[]> {
	const files = frames.map((_, i) => join(dir, sequenceFileName(i, frames.length)));
	await Promise.all(frames.map((frame, i) => writeFile(files[i], encodePng(frame))));
	return files;
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
