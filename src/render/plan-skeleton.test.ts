import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { JobRequest } from "#/render/plan-skeleton.ts";
import type { ResolvedInput } from "#/types.ts";

import { planSkeleton } from "#/render/plan-skeleton.ts";
import { atlasPage, resolvedInput } from "#/test/render-plan-fixtures.ts";

function request(overrides: Partial<JobRequest> = {}): JobRequest {
	return { pieceSpecs: [], format: "gif", ...overrides };
}

function targets(input: ResolvedInput, overrides: Partial<JobRequest> = {}): string[] {
	return planSkeleton(input, request(overrides)).jobs.map((j) => j.target.path);
}

describe("planSkeleton", () => {
	it("plans the only animation beside the skeleton without -a", () => {
		const { jobs } = planSkeleton(resolvedInput(), request());
		expect(jobs).toHaveLength(1);
		expect(jobs[0]).toMatchObject({ animation: "idle" });
		expect(jobs[0]?.target).toEqual({ path: join("/proj", "hero_idle.gif"), isDir: false });
	});

	it("plans a png sequence as a directory", () => {
		const { jobs } = planSkeleton(resolvedInput(), request({ format: "pngseq" }));
		expect(jobs[0]?.target).toEqual({ path: join("/proj", "hero_idle"), isDir: true });
	});

	it("plans every animation with -a all, naming each file after its animation", () => {
		const input = resolvedInput({ animations: ["idle", "run", "jump"] });
		expect(targets(input, { animation: "all", outDir: "/out" })).toEqual([
			join("/out", "hero_idle.gif"),
			join("/out", "hero_run.gif"),
			join("/out", "hero_jump.gif"),
		]);
	});

	it("plans only the requested animation and names the file after it", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		const { jobs } = planSkeleton(input, request({ animation: "run" }));
		expect(jobs.map((j) => j.animation)).toEqual(["run"]);
		expect(jobs.map((j) => j.target.path)).toEqual([join("/proj", "hero_run.gif")]);
	});

	it("writes to --out verbatim", () => {
		const { jobs } = planSkeleton(
			resolvedInput(),
			request({ out: "/else/where.gif", outDir: "/x" }),
		);
		expect(jobs[0]?.target).toEqual({ path: "/else/where.gif", isDir: false });
	});

	it("lists the animations when several exist and none is chosen", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		expect(() => planSkeleton(input, request())).toThrow(
			"multiple animations, pass --animation <name> or all; have: idle, run",
		);
	});

	it("lists the animations when the requested one does not exist", () => {
		const input = resolvedInput({ animations: ["idle", "run"] });
		expect(() => planSkeleton(input, request({ animation: "jump" }))).toThrow(
			'no animation "jump"; have: idle, run',
		);
	});

	it("refuses a skeleton with no animations", () => {
		const input = resolvedInput({ animations: [] });
		expect(() => planSkeleton(input, request())).toThrow("skeleton has no animations");
	});

	it("names every atlas texture missing on disk", () => {
		const input = resolvedInput({
			atlas: {
				pages: [atlasPage("a.png"), atlasPage("b.png", false), atlasPage("c.png", false)],
			},
		});
		expect(() => planSkeleton(input, request())).toThrow(
			"atlas texture missing on disk: /proj/b.png, /proj/c.png",
		);
	});
});

describe("planSkeleton with pieces", () => {
	const slots = ["door/l", "door/r", "chips/a", "background"];

	it("plans one job per animation and piece, naming each file after both", () => {
		const input = resolvedInput({ animations: ["open", "close"], slots });
		const { jobs } = planSkeleton(
			input,
			request({ animation: "all", pieceSpecs: ["door/*", "chips/*"] }),
		);
		expect(jobs.map((j) => j.target.path)).toEqual([
			join("/proj", "hero_open_door.gif"),
			join("/proj", "hero_open_chips.gif"),
			join("/proj", "hero_close_door.gif"),
			join("/proj", "hero_close_chips.gif"),
		]);
		expect(jobs[0]?.piece).toEqual({ name: "door", slots: ["door/l", "door/r"] });
	});

	it("returns the specs that matched no slot and plans the others", () => {
		const input = resolvedInput({ slots });
		const plan = planSkeleton(input, request({ pieceSpecs: ["door/*", "lid"] }));
		expect(plan.unmatchedPieces).toEqual(["lid"]);
		expect(plan.jobs.map((j) => j.piece?.name)).toEqual(["door"]);
	});

	it("refuses pieces on a skeleton with no slots", () => {
		const input = resolvedInput({ slots: [] });
		expect(() => planSkeleton(input, request({ pieceSpecs: ["*"] }))).toThrow(
			"skeleton has no slots to select pieces from",
		);
	});
});
