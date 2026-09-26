import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderCommand } from "#/commands/render.ts";
import { heroEnv } from "#/test/cmd-render-fixtures.ts";
import { readPng } from "#/test/encode-png-reader.ts";
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

	it("writes a webp sheet as one still through img2webp", async () => {
		const { env, processes } = clipEnv(3, 2, 4, ["img2webp"]);
		await renderCommand(env, TARGET, { format: "webp", sheet: true, quality: "90" });

		const [run] = processes.runsOf("img2webp");
		expect(run.args.slice(0, 3)).toEqual(["-lossy", "-q", "90"]);
		expect(run.args).not.toContain("-loop");
		expect(run.args.slice(-2)).toEqual(["-o", resolve("/proj/hero_idle.webp")]);
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
});
