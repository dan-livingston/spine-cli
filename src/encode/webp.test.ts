import { describe, expect, it } from "vite-plus/test";

import type { Rgba } from "#/test/encode-fixtures.ts";

import { encodeWebp, encodeWebpStill } from "#/encode/webp.ts";
import { BLUE, CLEAR, RED, frameOf, pixelsOf, solidFrame } from "#/test/encode-fixtures.ts";
import { readPng } from "#/test/encode-png-reader.ts";
import { fakeEnv } from "#/test/fake-env.ts";

function setup() {
	const fake = fakeEnv({ files: { dirs: ["/out"] }, processes: { installed: ["img2webp"] } });
	const seen: { args: string[]; inputs: Rgba[][] }[] = [];
	fake.processes.onRun("img2webp", async (run) => {
		const inputs = run.args.filter((arg) => arg.endsWith(".png"));
		const decoded = await Promise.all(
			inputs.map(async (path) => (await readPng(fake.files.bytes(path))).shown[0]),
		);
		seen.push({ args: run.args, inputs: decoded });
	});
	return { ...fake, seen };
}

function pngArgs(args: string[]): string[] {
	return args.filter((arg) => arg.endsWith(".png"));
}

function optionsBefore(args: string[], file: string): string[] {
	const at = args.indexOf(file);
	const previous = args.slice(0, at).findLastIndex((arg) => arg.endsWith(".png"));
	return args.slice(Math.max(previous + 1, args.indexOf("-kmax") + 2), at);
}

const clip = [
	frameOf(2, 2, [RED, CLEAR, [1, 2, 3, 128], BLUE]),
	solidFrame(2, 2, BLUE),
	solidFrame(2, 2, RED),
];

describe("encodeWebp", () => {
	it("rejects an empty clip without touching disk", async () => {
		const { env, files, processes } = setup();
		await expect(encodeWebp(env, "img2webp", "/out/a.webp", [], 30)).rejects.toThrow(
			"no frames to encode",
		);
		expect(files.tempDirs).toEqual([]);
		expect(processes.runs).toEqual([]);
	});

	it("hands img2webp every frame as a lossless png in play order, looping forever", async () => {
		const { env, seen } = setup();
		await encodeWebp(env, "img2webp", "/out/a.webp", clip, 30);
		expect(seen).toHaveLength(1);
		const [{ args, inputs }] = seen;
		expect(inputs).toEqual(clip.map((f) => pixelsOf(f.data)));
		expect(args.slice(0, 2)).toEqual(["-loop", "0"]);
		expect(args.slice(-2)).toEqual(["-o", "/out/a.webp"]);
	});

	it("is lossless for every frame when no quality is given", async () => {
		const { env, seen } = setup();
		await encodeWebp(env, "img2webp", "/out/a.webp", clip, 30);
		const { args } = seen[0];
		expect(pngArgs(args)).toHaveLength(3);
		for (const file of pngArgs(args)) {
			expect(optionsBefore(args, file)).toEqual(["-lossless", "-d", "33"]);
		}
	});

	it.each([0, 75, 100])("applies lossy quality %i to every frame", async (quality) => {
		const { env, seen } = setup();
		await encodeWebp(env, "img2webp", "/out/a.webp", clip, 24, quality);
		const { args } = seen[0];
		for (const file of pngArgs(args)) {
			expect(optionsBefore(args, file)).toEqual([
				"-lossy",
				"-q",
				String(quality),
				"-d",
				"42",
			]);
		}
	});

	it.each([
		[1, "1000"],
		[60, "17"],
		[5000, "1"],
	])("at %i fps gives each frame %s ms", async (fps, delay) => {
		const { env, seen } = setup();
		await encodeWebp(env, "img2webp", "/out/a.webp", clip, fps);
		const { args } = seen[0];
		expect(args.filter((_, i) => args[i - 1] === "-d")).toEqual([delay, delay, delay]);
	});

	it("removes its temporary frames once done", async () => {
		const { env, files } = setup();
		await encodeWebp(env, "img2webp", "/out/a.webp", clip, 30);
		expect(files.tempDirs).toHaveLength(1);
		expect(files.hasDir(files.tempDirs[0])).toBe(false);
		expect(files.filePaths()).toEqual([]);
	});

	it("reports img2webp failure and still removes its temporary frames", async () => {
		const { env, files, processes } = setup();
		processes.fail("img2webp", "bad frame");
		await expect(encodeWebp(env, "img2webp", "/out/a.webp", clip, 30)).rejects.toThrow(
			"img2webp exited 1: bad frame",
		);
		expect(files.hasDir(files.tempDirs[0])).toBe(false);
		expect(files.filePaths()).toEqual([]);
	});

	it("names 10000 frames so they stay in play order", async () => {
		const { env, processes } = setup();
		processes.onRun("img2webp", () => undefined);
		const many = Array.from({ length: 10000 }, (_, i) => solidFrame(1, 1, i % 2 ? RED : BLUE));
		await encodeWebp(env, "img2webp", "/out/a.webp", many, 30);
		const names = pngArgs(processes.runs[0].args);
		expect(names).toHaveLength(10000);
		expect([...names].sort()).toEqual(names);
		expect(names[0]).toMatch(/00001\.png$/);
		expect(names.at(-1)).toMatch(/10000\.png$/);
	});
});

describe("encodeWebpStill", () => {
	it("hands img2webp one lossless png with no animation options", async () => {
		const { env, seen, files } = setup();
		await encodeWebpStill(env, "img2webp", "/out/sheet.webp", clip[0]);
		expect(seen).toHaveLength(1);
		const [{ args, inputs }] = seen;
		expect(inputs).toEqual([pixelsOf(clip[0].data)]);
		expect(args).toEqual(["-lossless", pngArgs(args)[0], "-o", "/out/sheet.webp"]);
		expect(files.filePaths()).toEqual([]);
	});

	it("applies lossy quality", async () => {
		const { env, seen } = setup();
		await encodeWebpStill(env, "img2webp", "/out/sheet.webp", clip[0], 90);
		const { args } = seen[0];
		expect(args.slice(0, 3)).toEqual(["-lossy", "-q", "90"]);
	});

	it("removes its temporary frame when img2webp fails", async () => {
		const { env, files, processes } = setup();
		processes.fail("img2webp", "too big");
		await expect(encodeWebpStill(env, "img2webp", "/out/sheet.webp", clip[0])).rejects.toThrow(
			"img2webp exited 1: too big",
		);
		expect(files.filePaths()).toEqual([]);
	});
});
