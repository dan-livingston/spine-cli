import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { OutputContext } from "#/render/output-path.ts";

import { isFormat, planOutput } from "#/render/output-path.ts";

const chars = join("/proj", "chars");

const base: OutputContext = {
	jsonPath: join(chars, "hero.json"),
	skeletonName: "hero",
	animation: "run",
	includeAnimation: false,
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
	it("writes beside the skeleton, named after it, with the extension of the format", () => {
		expect(planOutput(base)).toEqual({ path: join(chars, "hero.gif"), isDir: false });
		expect(planOutput({ ...base, format: "apng" }).path).toBe(join(chars, "hero.apng"));
		expect(planOutput({ ...base, format: "webp" }).path).toBe(join(chars, "hero.webp"));
	});

	it("uses a directory with no extension for a png sequence", () => {
		expect(planOutput({ ...base, format: "pngseq" })).toEqual({
			path: join(chars, "hero"),
			isDir: true,
		});
	});

	it("adds the animation and then the piece to the name", () => {
		expect(planOutput({ ...base, includeAnimation: true, format: "mp4" }).path).toBe(
			join(chars, "hero_run.mp4"),
		);
		expect(
			planOutput({ ...base, includeAnimation: true, piece: "door", format: "webm" }).path,
		).toBe(join(chars, "hero_run_door.webm"));
		expect(planOutput({ ...base, piece: "door", format: "png" }).path).toBe(
			join(chars, "hero_door.png"),
		);
	});

	it("writes into --out-dir instead of beside the skeleton", () => {
		expect(planOutput({ ...base, outDir: "out", includeAnimation: true }).path).toBe(
			join("out", "hero_run.gif"),
		);
	});

	it("puts a png sequence directory into --out-dir", () => {
		expect(planOutput({ ...base, outDir: "out", format: "pngseq", piece: "door" })).toEqual({
			path: join("out", "hero_door"),
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

	it.fails("needs fix: an animation name with a Spine folder slash escapes into a subdirectory", () => {
		const target = planOutput({ ...base, animation: "combat/attack", includeAnimation: true });
		expect(target.path.slice(chars.length + 1)).not.toMatch(/[\\/]/);
	});
});
