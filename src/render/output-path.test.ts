import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { OutputContext } from "#/render/output-path.ts";

import { isFormat, planOutput } from "#/render/output-path.ts";

const chars = join("/proj", "chars");

const base: OutputContext = {
	jsonPath: join(chars, "hero.json"),
	skeletonName: "hero",
	animation: "run",
	format: "gif",
};

describe("isFormat", () => {
	it("accepts the documented formats and nothing else", () => {
		for (const f of ["pngseq", "png", "gif", "apng", "mp4", "webm", "webp"]) {
			expect(isFormat(f)).toBe(true);
		}
		for (const f of ["jpg", "GIF", "", "seq"]) {
			expect(isFormat(f)).toBe(false);
		}
	});
});

describe("planOutput", () => {
	it("writes beside the skeleton, named after it and the animation, with the extension of the format", () => {
		expect(planOutput(base)).toEqual({ path: join(chars, "hero_run.gif"), isDir: false });
		expect(planOutput({ ...base, format: "apng" }).path).toBe(join(chars, "hero_run.apng"));
		expect(planOutput({ ...base, format: "webp" }).path).toBe(join(chars, "hero_run.webp"));
	});

	it("uses a directory with no extension for a png sequence", () => {
		expect(planOutput({ ...base, format: "pngseq" })).toEqual({
			path: join(chars, "hero_run"),
			isDir: true,
		});
	});

	it("adds the piece after the animation", () => {
		expect(planOutput({ ...base, format: "mp4" }).path).toBe(join(chars, "hero_run.mp4"));
		expect(planOutput({ ...base, piece: "door", format: "webm" }).path).toBe(
			join(chars, "hero_run_door.webm"),
		);
		expect(planOutput({ ...base, piece: "door", format: "png" }).path).toBe(
			join(chars, "hero_run_door.png"),
		);
	});

	it("writes into --out-dir instead of beside the skeleton", () => {
		expect(planOutput({ ...base, outDir: "out" }).path).toBe(join("out", "hero_run.gif"));
	});

	it("puts a png sequence directory into --out-dir", () => {
		expect(planOutput({ ...base, outDir: "out", format: "pngseq", piece: "door" })).toEqual({
			path: join("out", "hero_run_door"),
			isDir: true,
		});
	});

	it("uses --out verbatim and treats it as a directory only for pngseq", () => {
		expect(planOutput({ ...base, out: "run.gif", outDir: "ignored" })).toEqual({
			path: "run.gif",
			isDir: false,
		});
		expect(planOutput({ ...base, out: "frames", format: "pngseq" })).toEqual({
			path: "frames",
			isDir: true,
		});
	});

	it("flattens Spine folder slashes in an animation name into underscores", () => {
		expect(planOutput({ ...base, animation: "combat/attack" }).path).toBe(
			join(chars, "hero_combat_attack.gif"),
		);
		expect(planOutput({ ...base, animation: "combat\\melee/jab" }).path).toBe(
			join(chars, "hero_combat_melee_jab.gif"),
		);
	});
});
