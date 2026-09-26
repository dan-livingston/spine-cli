import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

		expect(files.writtenPaths().sort()).toEqual(["/proj/hero_idle.apng"]);
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
			`skip ${resolve("/proj/boss.json")}: no animation "idle"; have: walk`,
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

	it("reports skips before failing when a batch has nothing to render", async () => {
		const { env, files, launches } = castEnv();
		files.seed("/proj/boss.json", "{ not json");
		await expect(renderCommand(env, "/proj", { animation: "jump" })).rejects.toThrow(
			'no renderable skeletons found for "/proj"',
		);
		expect(warnings).toEqual([
			`skip ${resolve("/proj/boss.json")}: skeleton file is not valid JSON`,
			`skip ${resolve("/proj/hero.json")}: no animation "jump"; have: idle`,
		]);
		expect(launches()).toBe(0);
	});

	it("keeps the animation in the survivor's name when a batch loses a skeleton at load time", async () => {
		const { env, files } = castEnv();
		files.seed("/proj/boss.json", "{ not json");
		await renderCommand(env, "/proj", { format: "apng" });

		expect(files.writtenPaths().sort()).toEqual(["/proj/hero_idle.apng"]);
	});
});

describe("renderCommand pieces", () => {
	const pieceOptions = { format: "apng", piece: ["h*", "body"] };
	const framing = (pool: ReturnType<typeof heroEnv>["pool"]) =>
		pool.renders.map(({ req }) => ({
			fit: req.fit,
			slots: req.slots,
			groupSlots: req.groupSlots,
		}));

	it.each(["declared", "bounds", "piece", "shared"])(
		"sends each piece with its own slots and the group's slots for --fit %s",
		async (fit) => {
			const { env, files, pool } = heroEnv({ slots: ["body", "head", "hat"] });
			await renderCommand(env, "/proj/hero.json", { ...pieceOptions, fit });

			const groupSlots = ["head", "hat", "body"];
			expect(framing(pool)).toEqual([
				{ fit, slots: ["head", "hat"], groupSlots },
				{ fit, slots: ["body"], groupSlots },
			]);
			expect(files.writtenPaths().sort()).toEqual([
				"/proj/hero_idle_body.apng",
				"/proj/hero_idle_h.apng",
			]);
		},
	);

	it("sends no slots without pieces", async () => {
		const { env, pool } = heroEnv();
		await renderCommand(env, "/proj/hero.json", { format: "apng", fit: "bounds" });

		expect(framing(pool)).toEqual([{ fit: "bounds", slots: undefined, groupSlots: undefined }]);
	});

	it("renders every piece of every animation in one session for -a all", async () => {
		const { env, files, pool } = heroEnv({ animations: ["idle", "run"] });
		await renderCommand(env, "/proj/hero.json", {
			...pieceOptions,
			animation: "all",
			fit: "shared",
		});

		expect(pool.renders.map((r) => [r.req.animation, r.req.slots])).toEqual([
			["idle", ["head"]],
			["idle", ["body"]],
			["run", ["head"]],
			["run", ["body"]],
		]);
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
			`skip --piece "h*" for ${resolve("/proj/boss.json")}: matched no slots`,
		]);
		expect(files.writtenPaths().sort()).toEqual([
			"/proj/boss_idle_body.apng",
			"/proj/hero_idle_body.apng",
			"/proj/hero_idle_h.apng",
		]);
	});
});
