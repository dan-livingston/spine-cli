import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderCommand } from "#/commands/render.ts";
import { heroEnv, seedSkeleton } from "#/test/cmd-render-fixtures.ts";
import { readPng } from "#/test/encode-png-reader.ts";
import { fakeEnv } from "#/test/fake-env.ts";
import { FakeFiles } from "#/test/fake-files.ts";
import { solidClip } from "#/test/fake-render-pool.ts";

let logs: string[];
let warnings: string[];

beforeEach(() => {
	logs = [];
	warnings = [];
	vi.spyOn(console, "log").mockImplementation((line: string) => {
		logs.push(line);
	});
	vi.spyOn(console, "warn").mockImplementation((line: string) => {
		warnings.push(line);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

const TARGET = "/proj/hero.json";

function clipEnv(width: number, height: number, frames: number, installed: string[] = []) {
	return heroEnv(
		{},
		{ pool: { clip: solidClip(width, height, frames) }, processes: { installed } },
	);
}

describe("renderCommand --sheet", () => {
	it("renders every frame of a png into one row", async () => {
		const { env, files, pool } = clipEnv(3, 2, 4);
		await renderCommand(env, TARGET, { format: "png", sheet: true });

		expect(pool.renders[0].req.times).toBeUndefined();
		const png = await readPng(files.bytes("/proj/hero_idle.png"));
		expect({ width: png.width, height: png.height }).toEqual({ width: 12, height: 2 });
	});

	it("writes a webp sheet as one still through cwebp", async () => {
		const { env, processes } = clipEnv(3, 2, 4, ["cwebp"]);
		await renderCommand(env, TARGET, { format: "webp", sheet: true, quality: "90" });

		const [run] = processes.runsOf("cwebp");
		expect(run.args.slice(0, 3)).toEqual(["-quiet", "-q", "90"]);
		expect(run.args).not.toContain("-loop");
		expect(run.args.slice(-2)).toEqual(["-o", resolve("/proj/hero_idle.webp")]);
	});

	it("needs cwebp, not img2webp, for a webp sheet", async () => {
		const { env, processes, launches } = clipEnv(3, 2, 4, ["img2webp"]);
		await expect(renderCommand(env, TARGET, { format: "webp", sheet: true })).rejects.toThrow(
			"cwebp not found on PATH; install libwebp to render webp",
		);
		expect(processes.versionChecks).toEqual(["cwebp"]);
		expect(launches()).toBe(0);
	});

	it("refuses --sheet for a format with no still before loading a skeleton", async () => {
		const { env, launches } = heroEnv();
		await expect(
			renderCommand(env, "/nowhere.json", { format: "gif", sheet: true }),
		).rejects.toThrow("--sheet only applies to png and webp; gif cannot write a sheet");
		expect(launches()).toBe(0);
	});

	it("writes a sidecar describing every frame beside the sheet and names both", async () => {
		const { env, files } = clipEnv(3, 2, 5);
		await renderCommand(env, TARGET, {
			format: "png",
			sheet: true,
			fps: "12",
			out: "/out/run.png",
		});

		expect(files.writtenPaths()).toEqual(["/out/run.png", "/out/run.sheet.json"]);
		expect(JSON.parse(new TextDecoder().decode(files.bytes("/out/run.sheet.json")))).toEqual({
			image: "run.png",
			format: "png",
			frameWidth: 3,
			frameHeight: 2,
			columns: 5,
			rows: 1,
			frameCount: 5,
			fps: 12,
			padding: 0,
			frames: [0, 3, 6, 9, 12].map((x) => ({ x, y: 0, w: 3, h: 2 })),
		});
		expect(logs).toEqual(["wrote /out/run.png and /out/run.sheet.json"]);
	});

	it("lists the sheet and its sidecar on a dry run", async () => {
		const { env, files } = heroEnv();
		await renderCommand(env, TARGET, { format: "png", sheet: true, dryRun: true });

		expect(logs).toEqual([
			resolve("/proj/hero_idle.png"),
			resolve("/proj/hero_idle.sheet.json"),
		]);
		expect(files.writes).toEqual([]);
	});

	it("lays frames out in the requested rows with padding between cells", async () => {
		const { env, files } = clipEnv(3, 2, 5);
		await renderCommand(env, TARGET, { format: "png", sheet: true, rows: "2", padding: "1" });

		const png = await readPng(files.bytes("/proj/hero_idle.png"));
		expect({ width: png.width, height: png.height }).toEqual({ width: 11, height: 5 });
		const sidecar = JSON.parse(
			new TextDecoder().decode(files.bytes("/proj/hero_idle.sheet.json")),
		);
		expect(sidecar).toMatchObject({ columns: 3, rows: 2, padding: 1 });
		expect(sidecar.frames.at(-1)).toEqual({ x: 4, y: 3, w: 3, h: 2 });
	});
});

describe("renderCommand --sheet size limits", () => {
	const TOO_WIDE_FOR_WEBP =
		'hero: sheet for animation "idle" is 16384x1 px, over the webp limit of 16383 px a side; use a smaller --scale, a lower --fps, or --rows/--columns';

	it("refuses a webp sheet wider than webp allows before encoding", async () => {
		const { env, files, processes } = clipEnv(8192, 1, 2, ["cwebp"]);
		await expect(renderCommand(env, TARGET, { format: "webp", sheet: true })).rejects.toThrow(
			TOO_WIDE_FOR_WEBP,
		);
		expect(processes.runsOf("cwebp")).toEqual([]);
		expect(files.writtenPaths()).toEqual([]);
	});

	it("accepts a webp sheet at the limit", async () => {
		const { env, processes } = clipEnv(1, 16383, 1, ["cwebp"]);
		await renderCommand(env, TARGET, { format: "webp", sheet: true });
		expect(processes.runsOf("cwebp")).toHaveLength(1);
	});

	it("writes a png sheet over 8192 px and warns about its size", async () => {
		const { env, files } = clipEnv(4097, 1, 2);
		await renderCommand(env, TARGET, { format: "png", sheet: true });

		expect(files.writtenPaths()).toContain("/proj/hero_idle.png");
		expect(warnings).toEqual([
			`${resolve("/proj/hero_idle.png")} is 8194x1 px; browsers and GPUs may refuse images over 8192 px a side`,
		]);
	});

	it("does not warn about a png sheet at 8192 px", async () => {
		const { env } = clipEnv(4096, 1, 2);
		await renderCommand(env, TARGET, { format: "png", sheet: true });
		expect(warnings).toEqual([]);
	});

	it("in a batch, skips the skeleton whose sheet is too large and renders the rest", async () => {
		const files = seedSkeleton(new FakeFiles(), "/proj", "hero");
		seedSkeleton(files, "/proj", "boss");
		const { env, processes } = fakeEnv({
			files,
			processes: { installed: ["cwebp"] },
			pool: {
				clip: (_, session) =>
					session.config.atlasText.startsWith("hero")
						? solidClip(8192, 1, 2)
						: solidClip(2, 2, 2),
			},
		});
		await renderCommand(env, "/proj", { format: "webp", sheet: true });

		expect(warnings).toEqual([
			`skip ${resolve("/proj/hero.json")}: ${TOO_WIDE_FOR_WEBP.replace("hero: ", "")}`,
		]);
		expect(processes.runsOf("cwebp").map((r) => r.args.at(-1))).toEqual([
			resolve("/proj/boss_idle.webp"),
		]);
	});
});
