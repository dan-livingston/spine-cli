import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { parseAtlas } from "#/spine/atlas.ts";

const twoPages = [
	"hero.png",
	"size:1024,512",
	"filter:Linear,Linear",
	"pma:true",
	"body",
	"bounds:2,2,100,200",
	"head",
	"bounds:104,2,64,64",
	"rotate:90",
	"",
	"hero2.png",
	"size:256,256",
	"filter:Linear,Linear",
	"sword",
	"bounds:0,0,30,120",
	"",
].join("\n");

const legacy = [
	"",
	"hero.png",
	"size: 512, 256",
	"format: RGBA8888",
	"filter: Linear,Linear",
	"repeat: none",
	"arm",
	"  rotate: false",
	"  xy: 2, 2",
	"  size: 40, 80",
	"  orig: 40, 80",
	"  offset: 0, 0",
	"  index: -1",
	"leg",
	"  rotate: true",
	"  xy: 44, 2",
	"  size: 20, 60",
	"  orig: 20, 60",
	"  offset: 0, 0",
	"  index: -1",
].join("\r\n");

describe("parseAtlas", () => {
	it("reads each page with its size, texture path and region names", () => {
		const pages = parseAtlas(twoPages, resolve("/proj/assets"));
		expect(pages).toEqual([
			{
				name: "hero.png",
				width: 1024,
				height: 512,
				texturePath: resolve("/proj/assets", "hero.png"),
				regions: ["body", "head"],
			},
			{
				name: "hero2.png",
				width: 256,
				height: 256,
				texturePath: resolve("/proj/assets", "hero2.png"),
				regions: ["sword"],
			},
		]);
	});

	it("reads the older indented format with CRLF line endings and a leading blank line", () => {
		const [page] = parseAtlas(legacy, resolve("/proj"));
		expect(page).toMatchObject({
			name: "hero.png",
			width: 512,
			height: 256,
			regions: ["arm", "leg"],
		});
	});

	it("does not mistake a region size for the page size", () => {
		const [page] = parseAtlas(legacy.replace("size: 512, 256\r\n", ""), resolve("/proj"));
		expect(page).toMatchObject({ width: 0, height: 0, regions: ["arm", "leg"] });
	});

	it("treats whitespace-only lines and runs of blank lines as page breaks", () => {
		const text =
			"a.png\nsize:8,8\nr1\nbounds:0,0,1,1\n   \n\n\t\nb.png\nsize:4,4\nr2\nbounds:0,0,1,1\n\n\n";
		expect(parseAtlas(text, resolve("/p")).map((p) => [p.name, p.regions])).toEqual([
			["a.png", ["r1"]],
			["b.png", ["r2"]],
		]);
	});

	it("resolves a page name that points into a subfolder against the atlas folder", () => {
		const [page] = parseAtlas("textures/hero.png\nsize:2,2\n", resolve("/proj/out"));
		expect(page.texturePath).toBe(resolve("/proj/out/textures/hero.png"));
		expect(page.regions).toEqual([]);
	});

	it("reports zero dimensions when the size is missing or unreadable", () => {
		const sizes = ["size:abc,def", "size:128", "filter:Linear,Linear"].map((header) => {
			const [page] = parseAtlas(`p.png\n${header}\nr\nbounds:0,0,1,1`, resolve("/p"));
			return [page.width, page.height];
		});
		expect(sizes).toEqual([
			[0, 0],
			[128, 0],
			[0, 0],
		]);
	});

	it("returns no pages for empty or blank text", () => {
		expect(parseAtlas("", resolve("/p"))).toEqual([]);
		expect(parseAtlas("\n\r\n  \n", resolve("/p"))).toEqual([]);
	});
});
