import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { JobPlan } from "#/render/plan.ts";

import { assertNoOutputCollisions, planJobs } from "#/render/plan.ts";
import { atlasPage, resolvedInput } from "#/test/render-plan-fixtures.ts";

function plan(overrides: Partial<JobPlan> = {}): JobPlan {
	return { batch: false, pieceSpecs: [], format: "gif", ...overrides };
}

function targets(jobs: { target: { path: string } }[]): string[] {
	return jobs.map((j) => j.target.path);
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("planJobs for one skeleton", () => {
	it("plans the only animation beside the skeleton without -a", () => {
		const jobs = planJobs([resolvedInput()], plan());
		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({ animation: "idle" });
		expect(jobs[0]?.target).toEqual({ path: join("/proj", "hero_idle.gif"), isDir: false });
	});

	it("plans a png sequence as a directory", () => {
		const jobs = planJobs([resolvedInput()], plan({ format: "pngseq" }));
		expect(jobs[0]?.target).toEqual({ path: join("/proj", "hero_idle"), isDir: true });
	});

	it("plans every animation with -a all, naming each file after its animation", () => {
		const input = resolvedInput({ animations: ["idle", "run", "jump"] });
		const jobs = planJobs([input], plan({ animation: "all", outDir: "/out" }));
		expect(jobs.map((j) => j.animation)).toEqual(["idle", "run", "jump"]);
		expect(targets(jobs)).toEqual([
			join("/out", "hero_idle.gif"),
			join("/out", "hero_run.gif"),
			join("/out", "hero_jump.gif"),
		]);
	});

	it("plans only the requested animation", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		const jobs = planJobs([input], plan({ animation: "run" }));
		expect(jobs.map((j) => j.animation)).toEqual(["run"]);
	});

	it("names the file after a single chosen animation", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		const jobs = planJobs([input], plan({ animation: "run" }));
		expect(targets(jobs)).toEqual([join("/proj", "hero_run.gif")]);
	});

	it("writes to --out verbatim", () => {
		const jobs = planJobs([resolvedInput()], plan({ out: "/else/where.gif", outDir: "/x" }));
		expect(jobs[0]?.target).toEqual({ path: "/else/where.gif", isDir: false });
	});

	it("lists the animations when several exist and none is chosen", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		expect(() => planJobs([input], plan())).toThrow(
			"multiple animations, pass --animation <name> or all; have: idle, run",
		);
	});

	it("lists the animations when the requested one does not exist", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		expect(() => planJobs([input], plan({ animation: "jump" }))).toThrow(
			'no animation "jump"; have: idle, run',
		);
	});

	it("names the skeleton once in an animation error", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		expect(() => planJobs([input], plan({ animation: "jump" }))).toThrow(
			/^hero: no animation "jump"; have: idle, run$/,
		);
	});

	it("refuses a skeleton with no animations", () => {
		const input = resolvedInput({ animations: [] });
		expect(() => planJobs([input], plan())).toThrow("skeleton has no animations");
	});

	it("refuses a skeleton whose JSON has no animations key", () => {
		const input = resolvedInput({ jsonText: JSON.stringify({ slots: [{ name: "body" }] }) });
		expect(() => planJobs([input], plan())).toThrow("skeleton has no animations");
	});

	it("fails a single skeleton whose JSON cannot be parsed, naming the skeleton", () => {
		const input = resolvedInput({ jsonText: "{not json" });
		expect(() => planJobs([input], plan())).toThrow(/^hero: /);
	});

	it("names every atlas texture missing on disk", () => {
		const input = resolvedInput({
			atlas: {
				pages: [atlasPage("a.png"), atlasPage("b.png", false), atlasPage("c.png", false)],
			},
		});
		expect(() => planJobs([input], plan())).toThrow(
			"hero: atlas texture missing on disk: /proj/b.png, /proj/c.png",
		);
	});
});

describe("planJobs with pieces", () => {
	const slots = ["door/l", "door/r", "chips/a", "background"];

	it("plans one job per animation and piece, naming each file after both", () => {
		const input = resolvedInput({ animations: ["open", "close"], slots });
		const jobs = planJobs(
			[input],
			plan({ animation: "all", pieceSpecs: ["door/*", "chips/*"] }),
		);
		expect(targets(jobs)).toEqual([
			join("/proj", "hero_open_door.gif"),
			join("/proj", "hero_open_chips.gif"),
			join("/proj", "hero_close_door.gif"),
			join("/proj", "hero_close_chips.gif"),
		]);
		expect(jobs[0]?.piece).toEqual({ name: "door", slots: ["door/l", "door/r"] });
	});

	it("reads slot names from a slots map as well as a slots array", () => {
		const input = resolvedInput({ slots: { "door/l": {}, background: {} } });
		const jobs = planJobs([input], plan({ pieceSpecs: ["door/*"] }));
		expect(jobs[0]?.piece?.slots).toEqual(["door/l"]);
	});

	it("fails a single skeleton when a piece matches no slots", () => {
		const input = resolvedInput({ slots });
		expect(() => planJobs([input], plan({ pieceSpecs: ["door/*", "lid"] }))).toThrow(
			'hero: --piece "lid" matched no slots',
		);
	});

	it("in a batch, warns about an unmatched piece and still plans the others", () => {
		const hero = resolvedInput({ slots });
		const vault = resolvedInput({ skeletonName: "vault", slots: ["lid"] });
		const jobs = planJobs([hero, vault], plan({ batch: true, pieceSpecs: ["door/*", "lid"] }));
		expect(targets(jobs)).toEqual([
			join("/proj", "hero_idle_door.gif"),
			join("/proj", "vault_idle_lid.gif"),
		]);
		expect(warn.mock.calls.map((c: unknown[]) => c[0])).toEqual([
			'skip /proj/hero.json: --piece "lid" matched no slots',
			'skip /proj/vault.json: --piece "door/*" matched no slots',
		]);
	});

	it("refuses pieces on a skeleton whose JSON has no slots key", () => {
		const input = resolvedInput({ jsonText: JSON.stringify({ animations: { idle: {} } }) });
		expect(() => planJobs([input], plan({ pieceSpecs: ["*"] }))).toThrow(
			"skeleton has no slots to select pieces from",
		);
	});

	it("refuses pieces on a skeleton with no slots", () => {
		const input = resolvedInput({ slots: [] });
		expect(() => planJobs([input], plan({ pieceSpecs: ["*"] }))).toThrow(
			"skeleton has no slots to select pieces from",
		);
	});
});

describe("planJobs for a batch", () => {
	it("always names files after the animation", () => {
		const jobs = planJobs(
			[resolvedInput(), resolvedInput({ skeletonName: "vault" })],
			plan({ batch: true }),
		);
		expect(targets(jobs)).toEqual([
			join("/proj", "hero_idle.gif"),
			join("/proj", "vault_idle.gif"),
		]);
	});

	it("skips skeletons it cannot plan, warning with the reason, and plans the rest", () => {
		const broken = resolvedInput({ skeletonName: "broken", jsonText: "{not json" });
		const noTexture = resolvedInput({
			skeletonName: "bare",
			atlas: { pages: [atlasPage("bare.png", false)] },
		});
		const ambiguous = resolvedInput({ skeletonName: "multi", animations: ["a", "b"] });
		const jobs = planJobs(
			[broken, noTexture, ambiguous, resolvedInput()],
			plan({ batch: true }),
		);
		expect(jobs.map((j) => j.input.skeletonName)).toEqual(["hero"]);
		const warnings = warn.mock.calls.map((c: unknown[]) => String(c[0]));
		expect(warnings).toHaveLength(3);
		expect(warnings[0]).toMatch(/^skip \/proj\/broken\.json: /);
		expect(warnings[1]).toBe(
			"skip /proj/bare.json: atlas texture missing on disk: /proj/bare.png",
		);
		expect(warnings[2]).toContain("skip /proj/multi.json: multiple animations");
	});

	it("does not warn when every skeleton plans", () => {
		planJobs([resolvedInput()], plan({ batch: true }));
		expect(warn).not.toHaveBeenCalled();
	});
});

describe("assertNoOutputCollisions", () => {
	it("accepts distinct targets", () => {
		const jobs = planJobs(
			[resolvedInput(), resolvedInput({ skeletonName: "vault" })],
			plan({ batch: true, outDir: "/out" }),
		);
		expect(() => assertNoOutputCollisions(jobs)).not.toThrow();
	});

	it("names both skeletons when they would write the same file", () => {
		const a = resolvedInput({ jsonPath: "/a/hero.json" });
		const b = resolvedInput({ jsonPath: "/b/hero.json" });
		const jobs = planJobs([a, b], plan({ batch: true, outDir: "/out" }));
		expect(() => assertNoOutputCollisions(jobs)).toThrow(
			`output collision: "/a/hero.json" and "/b/hero.json" both write ${join("/out", "hero_idle.gif")}; rename or render separately`,
		);
	});
});
