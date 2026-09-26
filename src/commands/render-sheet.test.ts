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
});
