import type { MockInstance } from "vite-plus/test";

import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { infoCommand } from "#/commands/info.ts";
import { FakeFiles } from "#/test/fake-files.ts";

const heroJson = JSON.stringify({
	skeleton: { spine: "4.2.11", width: 180.5, height: 320 },
	bones: [{ name: "root" }, { name: "torso", parent: "root" }, { name: "head", parent: "torso" }],
	slots: [
		{ name: "body", bone: "torso" },
		{ name: "head", bone: "head" },
	],
	ik: [{ name: "aim" }],
	transform: [],
	physics: [{ name: "hair" }, { name: "cape" }],
	skins: [
		{
			name: "default",
			attachments: {
				body: { body: {}, "body-mesh": { type: "mesh" } },
				head: { head: {} },
			},
		},
		{ name: "armored", attachments: { body: { armor: { type: "linkedmesh" } } } },
	],
	animations: {
		idle: {
			bones: {
				torso: {
					rotate: [
						{ value: 0, curve: [0.3, 0, 0.7, 5] },
						{ time: 1.2345, value: 5 },
					],
				},
			},
		},
		run: { bones: { head: { translate: [{}, { time: 0.5, x: 3 }] } } },
		attack_heavy: { events: [{ time: 2, name: "hit" }] },
	},
});

const heroAtlas = [
	"hero.png",
	"size: 1024,512",
	"filter: Linear,Linear",
	"head",
	"bounds: 2,2,64,64",
	"body",
	"bounds: 70,2,100,200",
	"",
	"hero2.png",
	"size: 256,256",
	"armor",
	"bounds: 2,2,50,50",
	"",
].join("\n");

function heroFiles(extra: Record<string, string> = {}): FakeFiles {
	return new FakeFiles({
		files: {
			"/proj/hero.json": heroJson,
			"/proj/hero.atlas": heroAtlas,
			"/proj/hero.png": new Uint8Array([1]),
			...extra,
		},
	});
}

let log: MockInstance<typeof console.log>;

beforeEach(() => {
	log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

function printed(): string {
	return log.mock.calls.map((call) => call.join(" ")).join("\n");
}

describe("infoCommand text output", () => {
	it("prints version, aligned animations, skins, counts, constraints and atlas pages", async () => {
		await infoCommand(heroFiles(), "/proj/hero.json", {});

		expect(printed().split("\n")).toEqual([
			"hero  (spine 4.2.11)",
			"animations (3):",
			"  idle          1.235s",
			"  run           0.500s",
			"  attack_heavy  2.000s",
			"skins (2): default, armored",
			"bones 3  slots 2  attachments 4  meshes yes  clipping no",
			"constraints: ik 1  transform 0  path 0  physics 2",
			"atlas: 2 pages",
			"  hero.png  1024x512",
			"  hero2.png  256x256",
			"WARNING missing texture: hero2.png",
		]);
	});

	it("adds region counts per atlas page with verbose", async () => {
		await infoCommand(heroFiles(), "/proj/hero.json", { verbose: true });

		const out = printed();
		expect(out).toContain("  hero.png  1024x512  2 regions");
		expect(out).toContain("  hero2.png  256x256  1 regions");
	});

	it.fails("needs fix: --verbose adds no per-animation detail although README promises it", async () => {
		await infoCommand(heroFiles(), "/proj/hero.json", {});
		const plain = printed().split("\n");
		log.mockClear();
		await infoCommand(heroFiles(), "/proj/hero.json", { verbose: true });
		const verbose = printed().split("\n");

		const animationSection = (lines: string[]) =>
			lines.slice(
				lines.indexOf("animations (3):"),
				lines.indexOf("skins (2): default, armored"),
			);
		expect(animationSection(verbose)).not.toEqual(animationSection(plain));
	});

	it("reports clipping, no animations and a single atlas page", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/bare.json": JSON.stringify({
					skeleton: { spine: "4.0.64" },
					skins: [
						{ name: "default", attachments: { mask: { clip: { type: "clipping" } } } },
					],
				}),
				"/proj/bare.atlas": "bare.png\nsize: 64,64\n",
				"/proj/bare.png": "png",
			},
		});

		await infoCommand(files, "/proj/bare.json", {});

		expect(printed().split("\n")).toEqual([
			"bare  (spine 4.0.64)",
			"animations (0):",
			"skins (1): default",
			"bones 0  slots 0  attachments 1  meshes no  clipping yes",
			"constraints: ik 0  transform 0  path 0  physics 0",
			"atlas: 1 page",
			"  bare.png  64x64",
		]);
	});

	it("prints (none) when the skeleton declares no skins", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/empty.json": JSON.stringify({ skeleton: { spine: "4.1.00" } }),
				"/proj/empty.atlas": "",
			},
		});

		await infoCommand(files, "/proj/empty.json", {});

		expect(printed().split("\n")).toEqual([
			"empty  (spine 4.1.00)",
			"animations (0):",
			"skins (0): (none)",
			"bones 0  slots 0  attachments 0  meshes no  clipping no",
			"constraints: ik 0  transform 0  path 0  physics 0",
			"atlas: 0 pages",
		]);
	});
});

describe("infoCommand json output", () => {
	it("prints a structured report including atlas pages and missing textures", async () => {
		await infoCommand(heroFiles(), "/proj/hero.json", { json: true });

		expect(log).toHaveBeenCalledTimes(1);
		const report = JSON.parse(printed());
		expect(report).toEqual({
			name: "hero",
			version: "4.2.11",
			major: "4.2",
			size: { width: 180.5, height: 320 },
			bones: 3,
			slots: 2,
			attachments: 4,
			hasMeshes: true,
			hasClipping: false,
			skins: ["default", "armored"],
			animations: [
				{ name: "idle", duration: 1.235 },
				{ name: "run", duration: 0.5 },
				{ name: "attack_heavy", duration: 2 },
			],
			constraints: { ik: 1, transform: 0, path: 0, physics: 2 },
			atlas: {
				path: resolve("/proj/hero.atlas"),
				pageCount: 2,
				pages: [
					{
						name: "hero.png",
						width: 1024,
						height: 512,
						textureExists: true,
						regionCount: 2,
					},
					{
						name: "hero2.png",
						width: 256,
						height: 256,
						textureExists: false,
						regionCount: 1,
					},
				],
				missingTextures: ["hero2.png"],
			},
		});
	});

	it("maps a 4.0 export to the 4.0 runtime major", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/old.json": JSON.stringify({ skeleton: { spine: "4.0.64" } }),
				"/proj/old.atlas": "",
			},
		});

		await infoCommand(files, "/proj/old.json", { json: true });

		expect(JSON.parse(printed())).toMatchObject({ version: "4.0.64", major: "4.0" });
	});

	it("maps a 4.1 export to the 4.2 runtime major", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/mid.json": JSON.stringify({ skeleton: { spine: "4.1.24" } }),
				"/proj/mid.atlas": "",
			},
		});

		await infoCommand(files, "/proj/mid.json", { json: true });

		expect(JSON.parse(printed())).toMatchObject({ version: "4.1.24", major: "4.2" });
	});
});

describe("infoCommand atlas selection", () => {
	it("uses the --atlas override instead of the one beside the skeleton", async () => {
		const files = heroFiles({
			"/art/other.atlas": "other.png\nsize: 32,16\nr\nbounds: 0,0,1,1\n",
			"/art/other.png": "png",
		});

		await infoCommand(files, "/proj/hero.json", { json: true, atlas: "/art/other.atlas" });

		const report = JSON.parse(printed());
		expect(report.atlas.path).toBe(resolve("/art/other.atlas"));
		expect(report.atlas.pages).toEqual([
			{ name: "other.png", width: 32, height: 16, textureExists: true, regionCount: 1 },
		]);
	});

	it("finds a .atlas.txt export beside the skeleton", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": heroJson,
				"/proj/hero.atlas.txt": "hero.png\nsize: 8,8\n",
				"/proj/hero.png": "png",
			},
		});

		await infoCommand(files, "/proj/hero.json", {});

		expect(printed()).toContain("  hero.png  8x8");
	});

	it("falls back to the only atlas in the directory when names differ", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.json": heroJson,
				"/proj/sheet.atlas": "sheet.png\nsize: 16,16\n",
				"/proj/sheet.png": "png",
			},
		});

		await infoCommand(files, "/proj/hero.json", { json: true });

		expect(JSON.parse(printed()).atlas.path).toBe(resolve("/proj/sheet.atlas"));
	});

	it("tells the user to pass --atlas when several atlases sit beside the skeleton", async () => {
		const files = new FakeFiles({
			files: { "/proj/hero.json": heroJson, "/proj/a.atlas": "", "/proj/b.atlas": "" },
		});

		await expect(infoCommand(files, "/proj/hero.json", {})).rejects.toThrow(
			"multiple atlases beside hero.json (a.atlas, b.atlas); pass --atlas",
		);
		expect(log).not.toHaveBeenCalled();
	});

	it("reports an --atlas override that does not exist", async () => {
		await expect(
			infoCommand(heroFiles(), "/proj/hero.json", { atlas: "/art/missing.atlas" }),
		).rejects.toThrow(`could not read atlas: ${resolve("/art/missing.atlas")}`);
		expect(log).not.toHaveBeenCalled();
	});

	it("tells the user to pass --atlas when no atlas is found", async () => {
		const files = new FakeFiles({ files: { "/proj/hero.json": heroJson } });

		await expect(infoCommand(files, "/proj/hero.json", {})).rejects.toThrow(
			"no atlas found beside hero.json; pass --atlas",
		);
	});
});

describe("infoCommand errors", () => {
	it("reports a missing skeleton file", async () => {
		await expect(infoCommand(new FakeFiles(), "/proj/ghost.json", {})).rejects.toThrow(
			`could not read skeleton json: ${resolve("/proj/ghost.json")}`,
		);
	});

	it("reports a skeleton that is not valid JSON", async () => {
		const files = new FakeFiles({
			files: { "/proj/hero.json": "{ not json", "/proj/hero.atlas": "" },
		});

		await expect(infoCommand(files, "/proj/hero.json", {})).rejects.toThrow(
			"skeleton file is not valid JSON",
		);
	});

	it("reports a skeleton without a spine version", async () => {
		const files = new FakeFiles({
			files: { "/proj/hero.json": JSON.stringify({ skeleton: {} }), "/proj/hero.atlas": "" },
		});

		await expect(infoCommand(files, "/proj/hero.json", {})).rejects.toThrow(
			'skeleton json has no "spine" version field',
		);
	});
});
