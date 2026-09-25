import { resolve } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";

import type { Entry } from "#/ports/files.ts";

import { resolveInput, resolveInputs } from "#/input/resolve.ts";
import { FakeFiles } from "#/test/fake-files.ts";

class ReversedFiles extends FakeFiles {
	override async list(dir: string): Promise<Entry[]> {
		return (await super.list(dir)).reverse();
	}

	override async glob(pattern: string): Promise<string[]> {
		return (await super.glob(pattern)).reverse();
	}
}

const skeleton = (version = "4.2.43"): string =>
	JSON.stringify({ skeleton: { hash: "x", spine: version }, bones: [{ name: "root" }] });

const atlas = (page = "hero.png"): string =>
	[
		page,
		"size: 64,32",
		"filter: Linear,Linear",
		"head",
		"bounds: 0,0,32,32",
		"body",
		"bounds: 32,0,32,32",
		"",
	].join("\n");

describe("resolveInput", () => {
	it("reads the skeleton and its same-named atlas and reports textures", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": skeleton(),
				"/proj/hero.atlas": atlas(),
				"/proj/hero.png": new Uint8Array([1]),
			},
		});

		const input = await resolveInput(files, "/proj/hero.json");

		expect(input).toMatchObject({
			jsonPath: resolve("/proj/hero.json"),
			skeletonName: "hero",
			atlasPath: resolve("/proj/hero.atlas"),
			version: "4.2.43",
			major: "4.2",
			jsonText: skeleton(),
			atlasText: atlas(),
		});
		expect(input.atlas.pages).toEqual([
			{
				name: "hero.png",
				width: 64,
				height: 32,
				texturePath: resolve("/proj/hero.png"),
				regions: ["head", "body"],
				textureExists: true,
			},
		]);
	});

	it("flags a texture the atlas names but that is missing", async () => {
		const files = new FakeFiles({
			files: { "/proj/hero.json": skeleton(), "/proj/hero.atlas": atlas("gone.png") },
		});
		const input = await resolveInput(files, "/proj/hero.json");
		expect(input.atlas.pages.map((p) => [p.name, p.textureExists])).toEqual([
			["gone.png", false],
		]);
	});

	it("maps a 4.0 and 4.1 export to the matching major", async () => {
		const files = new FakeFiles({
			files: {
				"/a/old.json": skeleton("4.0.64"),
				"/a/old.atlas": atlas(),
				"/b/mid.json": skeleton("4.1.24"),
				"/b/mid.atlas": atlas(),
			},
		});
		expect((await resolveInput(files, "/a/old.json")).major).toBe("4.0");
		expect((await resolveInput(files, "/b/mid.json")).major).toBe("4.2");
	});

	it("accepts a same-named .atlas.txt", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": skeleton(),
				"/proj/hero.atlas.txt": atlas(),
				"/proj/other.atlas": atlas(),
			},
		});
		const input = await resolveInput(files, "/proj/hero.json");
		expect(input.atlasPath).toBe(resolve("/proj/hero.atlas.txt"));
	});

	it("tries the same-named .atlas.txt before the same-named .atlas", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": skeleton(),
				"/proj/hero.atlas": atlas("plain.png"),
				"/proj/hero.atlas.txt": atlas("txt.png"),
			},
		});
		const input = await resolveInput(files, "/proj/hero.json");
		expect(input.atlasPath).toBe(resolve("/proj/hero.atlas.txt"));
		expect(input.atlas.pages.map((p) => p.name)).toEqual(["txt.png"]);
	});

	it("keeps inner dots of the skeleton name when looking for its atlas", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.v2.json": skeleton(),
				"/proj/hero.v2.atlas": atlas(),
				"/proj/hero.atlas": atlas(),
			},
		});
		const input = await resolveInput(files, "/proj/hero.v2.json");
		expect(input.skeletonName).toBe("hero.v2");
		expect(input.atlasPath).toBe(resolve("/proj/hero.v2.atlas"));
	});

	it("falls back to the only atlas beside the skeleton", async () => {
		const files = new FakeFiles({
			files: { "/proj/hero.json": skeleton(), "/proj/export.atlas": atlas() },
		});
		const input = await resolveInput(files, "/proj/hero.json");
		expect(input.atlasPath).toBe(resolve("/proj/export.atlas"));
	});

	it("prefers the same-named atlas when several sit beside the skeleton", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": skeleton(),
				"/proj/boss.atlas": atlas(),
				"/proj/hero.atlas": atlas(),
			},
		});
		const input = await resolveInput(files, "/proj/hero.json");
		expect(input.atlasPath).toBe(resolve("/proj/hero.atlas"));
	});

	it("asks for --atlas when no atlas is beside the skeleton", async () => {
		const files = new FakeFiles({ files: { "/proj/hero.json": skeleton() } });
		await expect(resolveInput(files, "/proj/hero.json")).rejects.toThrow(
			"no atlas found beside hero.json; pass --atlas",
		);
	});

	it("names every candidate when several atlases are ambiguous", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": skeleton(),
				"/proj/a.atlas": atlas(),
				"/proj/b.atlas.txt": atlas(),
			},
		});
		await expect(resolveInput(files, "/proj/hero.json")).rejects.toThrow(
			"multiple atlases beside hero.json (a.atlas, b.atlas.txt); pass --atlas",
		);
	});

	it("uses the --atlas override from anywhere and resolves textures beside it", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": skeleton(),
				"/proj/a.atlas": atlas(),
				"/proj/b.atlas": atlas(),
				"/shared/pack.atlas": atlas("pack.png"),
				"/shared/pack.png": new Uint8Array([1]),
			},
		});
		const input = await resolveInput(files, "/proj/hero.json", "/shared/pack.atlas");
		expect(input.atlasPath).toBe(resolve("/shared/pack.atlas"));
		expect(input.atlas.pages[0].texturePath).toBe(resolve("/shared/pack.png"));
		expect(input.atlas.pages[0].textureExists).toBe(true);
	});

	it("reports which file could not be read", async () => {
		const files = new FakeFiles({ files: { "/proj/hero.json": skeleton() } });
		await expect(resolveInput(files, "/proj/missing.json")).rejects.toThrow(
			`could not read skeleton json: ${resolve("/proj/missing.json")}`,
		);
		await expect(resolveInput(files, "/proj/hero.json", "/proj/nope.atlas")).rejects.toThrow(
			`could not read atlas: ${resolve("/proj/nope.atlas")}`,
		);
	});

	it("rejects a skeleton that is not JSON or has no version", async () => {
		const files = new FakeFiles({
			files: {
				"/a/bad.json": "not json",
				"/a/bad.atlas": atlas(),
				"/b/bare.json": "{}",
				"/b/bare.atlas": atlas(),
			},
		});
		await expect(resolveInput(files, "/a/bad.json")).rejects.toThrow(
			"skeleton file is not valid JSON",
		);
		await expect(resolveInput(files, "/b/bare.json")).rejects.toThrow(
			'skeleton json has no "spine" version field',
		);
	});

	it("resolves a relative skeleton path against the working directory", async () => {
		const cwd = resolve(".");
		const files = new FakeFiles({
			cwd,
			files: { "art/hero.json": skeleton(), "art/hero.atlas": atlas() },
		});
		const input = await resolveInput(files, "art/hero.json");
		expect(input.jsonPath).toBe(resolve(cwd, "art/hero.json"));
		expect(input.atlasPath).toBe(resolve(cwd, "art/hero.atlas"));
	});
});

describe("resolveInputs", () => {
	const batch = (): FakeFiles =>
		new FakeFiles({
			files: {
				"/proj/zeta.json": skeleton(),
				"/proj/zeta.atlas": atlas(),
				"/proj/alpha.json": skeleton(),
				"/proj/alpha.atlas": atlas(),
				"/proj/readme.txt": "x",
				"/proj/nested/deep.json": skeleton(),
				"/proj/nested/deep.atlas": atlas(),
			},
			dirs: ["/proj/folder.json"],
		});

	it("takes a single .json file", async () => {
		const inputs = await resolveInputs(batch(), "/proj/alpha.json", undefined);
		expect(inputs.map((i) => i.jsonPath)).toEqual([resolve("/proj/alpha.json")]);
	});

	it("searches a directory one level deep, sorted, files only", async () => {
		const inputs = await resolveInputs(batch(), "/proj", undefined);
		expect(inputs.map((i) => i.jsonPath)).toEqual([
			resolve("/proj/alpha.json"),
			resolve("/proj/zeta.json"),
		]);
	});

	it("expands a glob to sorted absolute json paths", async () => {
		const files = batch();
		await files.remove("/proj/folder.json");
		const inputs = await resolveInputs(files, "/proj/**/*", undefined);
		expect(inputs.map((i) => i.jsonPath)).toEqual([
			resolve("/proj/alpha.json"),
			resolve("/proj/nested/deep.json"),
			resolve("/proj/zeta.json"),
		]);
	});

	it("sorts directory and glob results whatever order the filesystem returns", async () => {
		const files = new ReversedFiles({
			files: {
				"/proj/alpha.json": skeleton(),
				"/proj/alpha.atlas": atlas(),
				"/proj/mid.json": skeleton(),
				"/proj/mid.atlas": atlas(),
				"/proj/zeta.json": skeleton(),
				"/proj/zeta.atlas": atlas(),
			},
		});
		const expected = ["alpha", "mid", "zeta"];
		const fromDir = await resolveInputs(files, "/proj", undefined);
		const fromGlob = await resolveInputs(files, "/proj/*.json", undefined);
		expect(fromDir.map((i) => i.skeletonName)).toEqual(expected);
		expect(fromGlob.map((i) => i.skeletonName)).toEqual(expected);
	});

	it.fails("needs fix: a glob that matches a directory named *.json reports it as a skipped skeleton", async () => {
		const onSkip = vi.fn();
		const inputs = await resolveInputs(batch(), "/proj/*", undefined, onSkip);
		expect(inputs.map((i) => i.skeletonName)).toEqual(["alpha", "zeta"]);
		expect(onSkip).not.toHaveBeenCalled();
	});

	it("resolves a relative glob against the working directory", async () => {
		const cwd = resolve(".");
		const files = new FakeFiles({
			cwd,
			files: { "art/hero.json": skeleton(), "art/hero.atlas": atlas() },
		});
		const inputs = await resolveInputs(files, "art/*.json", undefined);
		expect(inputs.map((i) => i.jsonPath)).toEqual([resolve(cwd, "art/hero.json")]);
	});

	it("explains a missing target, a non-json file and an empty match", async () => {
		const files = batch();
		await expect(resolveInputs(files, "/nowhere", undefined)).rejects.toThrow(
			"no such file or directory: /nowhere",
		);
		await expect(resolveInputs(files, "/proj/readme.txt", undefined)).rejects.toThrow(
			"expected a .json skeleton, got: /proj/readme.txt",
		);
		await expect(resolveInputs(files, "/proj/*.skel", undefined)).rejects.toThrow(
			'no skeleton json found for "/proj/*.skel"',
		);
		await expect(
			resolveInputs(new FakeFiles({ dirs: ["/empty"] }), "/empty", undefined),
		).rejects.toThrow('no skeleton json found for "/empty"');
	});

	it("skips a broken skeleton in a batch and reports why", async () => {
		const files = batch().seed("/proj/broken.json", "{").seed("/proj/broken.atlas", atlas());
		const onSkip = vi.fn();
		const inputs = await resolveInputs(files, "/proj", undefined, onSkip);
		expect(inputs.map((i) => i.skeletonName)).toEqual(["alpha", "zeta"]);
		expect(onSkip).toHaveBeenCalledTimes(1);
		expect(onSkip).toHaveBeenCalledWith(
			resolve("/proj/broken.json"),
			"skeleton file is not valid JSON",
		);
	});

	it("fails a batch on the first broken skeleton when nobody listens for skips", async () => {
		const files = batch().seed("/proj/broken.json", "{").seed("/proj/broken.atlas", atlas());
		await expect(resolveInputs(files, "/proj", undefined)).rejects.toThrow(
			"skeleton file is not valid JSON",
		);
	});

	it("surfaces the real error for a single input even with a skip listener", async () => {
		const onSkip = vi.fn();
		const files = new FakeFiles({ files: { "/solo/hero.json": skeleton() } });
		await expect(resolveInputs(files, "/solo", undefined, onSkip)).rejects.toThrow(
			"no atlas found beside hero.json; pass --atlas",
		);
		expect(onSkip).not.toHaveBeenCalled();
	});

	it("says nothing was renderable when every skeleton in a batch is skipped", async () => {
		const files = new FakeFiles({ files: { "/bad/a.json": "{", "/bad/b.json": "{}" } });
		const onSkip = vi.fn();
		await expect(resolveInputs(files, "/bad", undefined, onSkip)).rejects.toThrow(
			'no renderable skeletons found for "/bad"',
		);
		expect(onSkip.mock.calls).toEqual([
			[resolve("/bad/a.json"), "no atlas found beside a.json; pass --atlas"],
			[resolve("/bad/b.json"), "no atlas found beside b.json; pass --atlas"],
		]);
	});

	it("applies an --atlas override to every skeleton in the batch", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/a.json": skeleton(),
				"/proj/b.json": skeleton(),
				"/shared/pack.atlas": atlas(),
			},
		});
		const inputs = await resolveInputs(files, "/proj", "/shared/pack.atlas");
		expect(inputs.map((i) => i.atlasPath)).toEqual([
			resolve("/shared/pack.atlas"),
			resolve("/shared/pack.atlas"),
		]);
	});

	it.fails("needs fix: a literal skeleton path containing brackets is treated as a glob and not found", async () => {
		const files = new FakeFiles({
			files: { "/art/hero[v2].json": skeleton(), "/art/hero[v2].atlas": atlas() },
		});
		const inputs = await resolveInputs(files, "/art/hero[v2].json", undefined);
		expect(inputs.map((i) => i.jsonPath)).toEqual([resolve("/art/hero[v2].json")]);
	});

	it.fails("needs fix: an upper-case .JSON skeleton is rejected though its name is stripped case-insensitively", async () => {
		const files = new FakeFiles({
			files: { "/art/Hero.JSON": skeleton(), "/art/Hero.atlas": atlas() },
		});
		const inputs = await resolveInputs(files, "/art/Hero.JSON", undefined);
		expect(inputs.map((i) => i.skeletonName)).toEqual(["Hero"]);
	});
});
