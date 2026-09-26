import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { PlanRequest, RenderPlan } from "#/render/plan.ts";

import { PlanError, planRender } from "#/render/plan.ts";
import { seedSkeleton } from "#/test/cmd-render-fixtures.ts";
import { FakeFiles } from "#/test/fake-files.ts";

function request(target: string, overrides: Partial<PlanRequest> = {}): PlanRequest {
	return { target, pieceSpecs: [], format: "gif", ...overrides };
}

function cast(): FakeFiles {
	const files = seedSkeleton(new FakeFiles(), "/proj", "hero");
	return seedSkeleton(files, "/proj", "vault", { slots: ["lid"] });
}

async function failure(files: FakeFiles, req: PlanRequest): Promise<PlanError> {
	const error = await planRender(files, req).then(
		() => new Error("expected planRender to reject"),
		(err: Error) => err,
	);
	if (!(error instanceof PlanError)) throw error;
	return error;
}

const targets = (plan: RenderPlan): string[] => plan.jobs.map((j) => j.target.path);

describe("planRender for one skeleton", () => {
	it("plans the skeleton with nothing skipped", async () => {
		const plan = await planRender(cast(), request("/proj/hero.json"));
		expect(targets(plan)).toEqual([join(resolve("/proj"), "hero_idle.gif")]);
		expect(plan.skipped).toEqual([]);
	});

	it("names the skeleton once when it cannot be planned", async () => {
		const files = cast();
		await expect(
			planRender(files, request("/proj/hero.json", { animation: "jump" })),
		).rejects.toThrow(/^hero: no animation "jump"; have: idle$/);
	});

	it("names the skeleton once when it has no slots for a piece", async () => {
		const files = seedSkeleton(new FakeFiles(), "/proj", "hero", { slots: [] });
		await expect(
			planRender(files, request("/proj/hero.json", { pieceSpecs: ["*"] })),
		).rejects.toThrow(/^hero: skeleton has no slots to select pieces from$/);
	});

	it("fails when a piece matches no slot", async () => {
		await expect(
			planRender(cast(), request("/proj/hero.json", { pieceSpecs: ["door/*"] })),
		).rejects.toThrow('hero: --piece "door/*" matched no slots');
	});

	it("surfaces a load error as it is", async () => {
		const files = cast().seed("/proj/hero.json", "{");
		await expect(planRender(files, request("/proj/hero.json"))).rejects.toThrow(
			/^skeleton file is not valid JSON$/,
		);
	});
});

describe("planRender for a batch", () => {
	it("skips a skeleton it cannot plan and one it cannot load, then has nothing to render", async () => {
		const files = seedSkeleton(new FakeFiles(), "/proj", "hero", { animations: ["walk"] });
		files.seed("/proj/boss.json", "{");
		const error = await failure(files, request("/proj", { animation: "idle" }));
		expect(error.message).toBe('no renderable skeletons found for "/proj"');
		expect(error.skipped).toEqual([
			{
				path: resolve("/proj/boss.json"),
				reason: "skeleton file is not valid JSON",
			},
			{ path: resolve("/proj/hero.json"), reason: 'no animation "idle"; have: walk' },
		]);
	});

	it("plans the survivor of a load failure as part of the batch", async () => {
		const files = seedSkeleton(new FakeFiles(), "/proj", "hero", {
			animations: ["idle", "run"],
		});
		seedSkeleton(files, "/proj", "boss").seed("/proj/boss.json", "{");
		const error = await failure(files, request("/proj"));
		expect(error.skipped.map((s) => s.reason)).toEqual([
			"skeleton file is not valid JSON",
			"multiple animations, pass --animation <name> or all; have: idle, run",
		]);
	});

	it("reports a dropped piece as a piece and keeps the skeleton", async () => {
		const plan = await planRender(cast(), request("/proj", { pieceSpecs: ["body", "lid"] }));
		expect(targets(plan)).toEqual([
			join(resolve("/proj"), "hero_idle_body.gif"),
			join(resolve("/proj"), "vault_idle_lid.gif"),
		]);
		expect(plan.skipped).toEqual([
			{ path: resolve("/proj/hero.json"), reason: "matched no slots", piece: "lid" },
			{ path: resolve("/proj/vault.json"), reason: "matched no slots", piece: "body" },
		]);
	});

	it("applies an --atlas override to every skeleton", async () => {
		const files = cast().seed("/shared/pack.atlas", "hero.png\nsize: 4,4\n");
		files.seed("/shared/hero.png", new Uint8Array([1]));
		const plan = await planRender(files, request("/proj", { atlas: "/shared/pack.atlas" }));
		expect(plan.jobs.map((j) => j.input.atlasPath)).toEqual([
			resolve("/shared/pack.atlas"),
			resolve("/shared/pack.atlas"),
		]);
	});
});

describe("planRender output checks", () => {
	it("refuses --out for several outputs before it looks for collisions", async () => {
		const error = await failure(cast(), request("/proj", { out: "/x.gif" }));
		expect(error.message).toBe("--out writes a single output but 2 are planned; use --out-dir");
	});

	it("names both skeletons when they would write the same file, keeping the skips", async () => {
		const files = seedSkeleton(new FakeFiles(), "/a", "hero");
		seedSkeleton(files, "/b", "hero");
		files.seed("/a/broken.json", "{");
		const error = await failure(files, request("/*/*.json", { outDir: "/out" }));
		expect(error.message).toBe(
			`output collision: "${resolve("/a/hero.json")}" and "${resolve("/b/hero.json")}" both write ${join("/out", "hero_idle.gif")}; rename or render separately`,
		);
		expect(error.skipped.map((s) => s.path)).toEqual([resolve("/a/broken.json")]);
	});
});
