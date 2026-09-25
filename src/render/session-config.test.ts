import { describe, expect, it } from "vite-plus/test";

import type { AtlasPage, ResolvedInput } from "#/types.ts";

import { sessionConfig } from "#/render/session-config.ts";
import { FakeFiles } from "#/test/fake-files.ts";

const page = (name: string, textureExists = true): AtlasPage => ({
	name,
	width: 4,
	height: 4,
	texturePath: `/proj/${name}`,
	regions: [],
	textureExists,
});

const input = (pages: AtlasPage[]): ResolvedInput => ({
	jsonPath: "/proj/hero.json",
	skeletonName: "hero",
	jsonText: '{"skeleton":{"spine":"4.2.11"}}',
	atlasPath: "/proj/hero.atlas",
	atlasText: "hero.png\nsize: 4,4\n",
	atlas: { pages },
	version: "4.2.11",
	major: "4.2",
});

const decode = (dataUrl: string): { mime: string; bytes: number[] } => {
	const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
	if (!match) throw new Error(`not a data url: ${dataUrl}`);
	return { mime: match[1], bytes: [...Buffer.from(match[2], "base64")] };
};

describe("sessionConfig", () => {
	it("embeds every atlas page as a data url with the skeleton text and scale", async () => {
		const files = new FakeFiles({
			files: {
				"/proj/hero.png": new Uint8Array([137, 80, 78, 71, 0, 255]),
				"/proj/hero2.png": new Uint8Array([1, 2, 3]),
			},
		});
		const source = input([page("hero.png"), page("hero2.png")]);
		const config = await sessionConfig(files, source, 0.5);
		expect(config.major).toBe("4.2");
		expect(config.jsonText).toBe(source.jsonText);
		expect(config.atlasText).toBe(source.atlasText);
		expect(config.scale).toBe(0.5);
		expect(config.pages.map((p) => p.name)).toEqual(["hero.png", "hero2.png"]);
		expect(decode(config.pages[0].dataUrl)).toEqual({
			mime: "image/png",
			bytes: [137, 80, 78, 71, 0, 255],
		});
		expect(decode(config.pages[1].dataUrl).bytes).toEqual([1, 2, 3]);
	});

	it("labels jpeg and webp textures with their own mime type, ignoring case", async () => {
		const names = ["a.jpg", "b.JPEG", "c.webp", "d.PNG"];
		const files = new FakeFiles();
		for (const name of names) files.seed(`/proj/${name}`, new Uint8Array([9]));
		const config = await sessionConfig(files, input(names.map((n) => page(n))), 1);
		expect(config.pages.map((p) => decode(p.dataUrl).mime)).toEqual([
			"image/jpeg",
			"image/jpeg",
			"image/webp",
			"image/png",
		]);
	});

	it("builds a config with no pages for an atlas with no pages", async () => {
		const config = await sessionConfig(new FakeFiles(), input([]), 1);
		expect(config.pages).toEqual([]);
	});

	it("names the missing texture path when a page's texture is absent", async () => {
		const files = new FakeFiles({ files: { "/proj/hero.png": new Uint8Array([1]) } });
		await expect(
			sessionConfig(files, input([page("hero.png"), page("gone.png", false)]), 1),
		).rejects.toThrow("atlas texture missing on disk: /proj/gone.png");
	});

	it("surfaces a read failure when the texture vanished after resolving", async () => {
		await expect(
			sessionConfig(new FakeFiles(), input([page("hero.png")]), 1),
		).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
