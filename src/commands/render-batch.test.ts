import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MeasureResult } from "#/render/harness/contract.ts";

import { renderCommand } from "#/commands/render.ts";
import { heroEnv, seedSkeleton } from "#/test/cmd-render-fixtures.ts";
import { fakeEnv } from "#/test/fake-env.ts";
import { FakeFiles } from "#/test/fake-files.ts";

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

function castEnv(boss: Parameters<typeof seedSkeleton>[3] = {}) {
	const files = seedSkeleton(new FakeFiles(), "/proj", "hero");
	seedSkeleton(files, "/proj", "boss", boss);
	return fakeEnv({ files });
}

describe("renderCommand batch", () => {
	it("renders every skeleton in a directory with the animation in each name", async () => {
		const { env, files, pool } = castEnv();
		await renderCommand(env, "/proj", { animation: "idle", format: "apng" });

		expect(files.writtenPaths().sort()).toEqual([
			"/proj/boss_idle.apng",
			"/proj/hero_idle.apng",
		]);
		expect(pool.sessions).toHaveLength(2);
		expect(pool.openSessions()).toEqual([]);
		expect(pool.workers).toHaveLength(1);
		expect(pool.closeCount).toBe(1);
	});

	it("matches a glob target", async () => {
		const { env, files } = castEnv();
		await renderCommand(env, "/proj/h*.json", { format: "apng" });

		expect(files.writtenPaths().sort()).toEqual(["/proj/hero.apng"]);
	});

	it("spreads skeletons over --concurrency workers but never more workers than skeletons", async () => {
		const two = castEnv();
		await renderCommand(two.env, "/proj", { format: "apng", concurrency: "2" });
		expect(two.pool.workers).toHaveLength(2);
		expect(new Set(two.pool.sessions.map((s) => s.worker))).toEqual(new Set([0, 1]));

		const capped = castEnv();
		await renderCommand(capped.env, "/proj", { format: "apng", concurrency: "8" });
		expect(capped.pool.workers).toHaveLength(2);
		expect(capped.files.writtenPaths().sort()).toEqual([
			"/proj/boss_idle.apng",
			"/proj/hero_idle.apng",
		]);
	});

	it("skips a skeleton it cannot plan, reports it, and renders the rest", async () => {
		const { env, files } = castEnv({ animations: ["walk"] });
		await renderCommand(env, "/proj", { animation: "idle", format: "apng" });

		expect(files.writtenPaths().sort()).toEqual(["/proj/hero_idle.apng"]);
		expect(warnings).toEqual([
			`skip ${resolve("/proj/boss.json")}: boss: no animation "idle"; have: walk`,
		]);
	});

	it("fails when every skeleton in a batch is skipped", async () => {
		const { env, launches } = castEnv();
		await expect(renderCommand(env, "/proj", { animation: "jump" })).rejects.toThrow(
			'no renderable skeletons found for "/proj"',
		);
		expect(warnings).toHaveLength(2);
		expect(launches()).toBe(0);
	});

	it("skips a skeleton it cannot load and reports it", async () => {
		const { env, files } = castEnv();
		files.seed("/proj/boss.json", "{ not json");
		await renderCommand(env, "/proj", { format: "apng" });

		expect(warnings).toEqual([
			`skip ${resolve("/proj/boss.json")}: skeleton file is not valid JSON`,
		]);
		expect(files.writtenPaths()).toHaveLength(1);
		expect(files.writtenPaths()[0]).toMatch(/^\/proj\/hero/);
	});

	it("refuses skeletons from different folders that would write the same file", async () => {
		const files = seedSkeleton(new FakeFiles(), "/proj/a", "hero");
		seedSkeleton(files, "/proj/b", "hero");
		const { env, launches } = fakeEnv({ files });

		await expect(
			renderCommand(env, "/proj/*/hero.json", { format: "apng", outDir: "/out" }),
		).rejects.toThrow(
			`output collision: "${resolve("/proj/a/hero.json")}" and "${resolve("/proj/b/hero.json")}" both write ${join("/out", "hero_idle.apng")}`,
		);
		expect(launches()).toBe(0);
	});

	it.fails("needs fix: a batch that loses a skeleton at load time drops the animation from the survivor's name", async () => {
		const { env, files } = castEnv();
		files.seed("/proj/boss.json", "{ not json");
		await renderCommand(env, "/proj", { format: "apng" });

		expect(files.writtenPaths().sort()).toEqual(["/proj/hero_idle.apng"]);
	});
});

const MEASURED: MeasureResult = {
	perPiece: [
		{ x: 1, y: 1, width: 10, height: 10 },
		{ x: 2, y: 2, width: 20, height: 20 },
	],
	selectedUnion: { x: 1, y: 1, width: 21, height: 21 },
	skeletonUnion: { x: 0, y: 0, width: 50, height: 50 },
	declared: { x: -5, y: -5, width: 100, height: 100 },
};

describe("renderCommand pieces", () => {
	const pieceOptions = { format: "apng", piece: ["h*", "body"] };

	it("renders one file per piece framed to its own bounds with --fit piece", async () => {
		const { env, files, pool } = heroEnv(
			{ slots: ["body", "head", "hat"] },
			{ pool: { measure: MEASURED } },
		);
		await renderCommand(env, "/proj/hero.json", { ...pieceOptions, fit: "piece" });

		expect(pool.measures.map((m) => m.req.pieces)).toEqual([[["head", "hat"], ["body"]]]);
		expect(pool.renders.map((r) => [r.req.slots, r.req.box])).toEqual([
			[["head", "hat"], MEASURED.perPiece[0]],
			[["body"], MEASURED.perPiece[1]],
		]);
		expect(files.writtenPaths().sort()).toEqual(["/proj/hero_body.apng", "/proj/hero_h.apng"]);
	});

	it.each([
		["shared", MEASURED.selectedUnion],
		["bounds", MEASURED.skeletonUnion],
	])("frames every piece to the same box with --fit %s", async (fit, box) => {
		const { env, pool } = heroEnv({}, { pool: { measure: MEASURED } });
		await renderCommand(env, "/proj/hero.json", { ...pieceOptions, fit });

		expect(pool.renders.map((r) => r.req.box)).toEqual([box, box]);
	});

	it("skips measuring with the default declared fit", async () => {
		const { env, pool } = heroEnv();
		await renderCommand(env, "/proj/hero.json", pieceOptions);

		expect(pool.measures).toEqual([]);
		expect(pool.renders.map((r) => [r.req.slots, r.req.box])).toEqual([
			[["head"], undefined],
			[["body"], undefined],
		]);
	});

	it("measures each animation separately for -a all", async () => {
		const { env, files, pool } = heroEnv({ animations: ["idle", "run"] });
		await renderCommand(env, "/proj/hero.json", {
			...pieceOptions,
			animation: "all",
			fit: "shared",
		});

		expect(pool.measures.map((m) => m.req.animation)).toEqual(["idle", "run"]);
		expect(files.writtenPaths().sort()).toEqual([
			"/proj/hero_idle_body.apng",
			"/proj/hero_idle_h.apng",
			"/proj/hero_run_body.apng",
			"/proj/hero_run_h.apng",
		]);
		expect(pool.sessions).toHaveLength(1);
	});

	it("in a batch, warns about a piece that matches nothing and renders the others", async () => {
		const { env, files } = castEnv({ slots: ["body"] });
		await renderCommand(env, "/proj", pieceOptions);

		expect(warnings).toEqual([
			`skip ${resolve("/proj/boss.json")}: --piece "h*" matched no slots`,
		]);
		expect(files.writtenPaths().sort()).toEqual([
			"/proj/boss_idle_body.apng",
			"/proj/hero_idle_body.apng",
			"/proj/hero_idle_h.apng",
		]);
	});
});
