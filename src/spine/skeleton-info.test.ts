import { describe, expect, it } from "vite-plus/test";

import { parseSkeletonInfo } from "#/spine/skeleton-info.ts";

const hero = {
	skeleton: {
		hash: "abc",
		spine: "4.2.43",
		x: -50,
		y: 0,
		width: 120.5,
		height: 240,
		images: "./images/",
	},
	bones: [{ name: "root" }, { name: "hip", parent: "root" }, { name: "arm", parent: "hip" }],
	slots: [
		{ name: "body", bone: "hip", attachment: "body" },
		{ name: "arm", bone: "arm", attachment: "arm" },
	],
	ik: [{ name: "arm-ik", bones: ["arm"], target: "hip" }],
	transform: [{ name: "t1" }, { name: "t2" }, { name: "t3" }],
	path: [{ name: "p1" }, { name: "p2" }],
	physics: [{ name: "h1" }, { name: "h2" }, { name: "h3" }, { name: "h4" }],
	skins: [
		{
			name: "default",
			attachments: {
				body: { body: { width: 10, height: 10 }, clip: { type: "clipping", end: "arm" } },
				arm: { arm: { type: "mesh", uvs: [], vertices: [] } },
			},
		},
		{ name: "armor", attachments: { body: { plate: { type: "region" } } } },
	],
	animations: {
		idle: {
			bones: {
				hip: {
					rotate: [
						{ value: 0 },
						{ time: 0.5, value: 10, curve: [0.6, 0, 0.9, 1] },
						{ time: 1.25 },
					],
				},
			},
		},
		walk: {
			slots: { body: { rgba: [{ time: 0.3333333, color: "ffffffff" }] } },
			events: [{ time: 2.0004, name: "step" }],
			drawOrder: [{ time: 0.1 }],
		},
		pose: {},
	},
};

describe("parseSkeletonInfo", () => {
	it("summarises a 4.x skeleton", () => {
		expect(parseSkeletonInfo(JSON.stringify(hero))).toMatchObject({
			width: 120.5,
			height: 240,
			bones: 3,
			slots: 2,
			attachments: 4,
			skins: ["default", "armor"],
			animations: [
				{ name: "idle", duration: 1.25 },
				{ name: "walk", duration: 2 },
				{ name: "pose", duration: 0 },
			],
			constraints: { ik: 1, transform: 3, path: 2, physics: 4 },
			hasMeshes: true,
			hasClipping: true,
		});
	});

	it("takes the latest keyframe across deeply nested timelines", () => {
		const json = JSON.stringify({
			animations: {
				hit: {
					attachments: {
						default: { body: { body: { deform: [{ time: 0.2 }, { time: 3.14159 }] } } },
					},
					bones: { hip: { translate: [{ time: 1 }] } },
				},
			},
		});
		expect(parseSkeletonInfo(json).animations).toMatchObject([
			{ name: "hit", duration: 3.142 },
		]);
	});

	it("reads the older object form of skins", () => {
		const json = JSON.stringify({
			skins: {
				default: { body: { body: {}, tail: { type: "linkedmesh", parent: "body" } } },
				red: { body: { body: { type: "boundingbox" } } },
			},
		});
		const info = parseSkeletonInfo(json);
		expect(info.skins).toEqual(["default", "red"]);
		expect(info.attachments).toBe(3);
		expect(info.hasMeshes).toBe(true);
		expect(info.hasClipping).toBe(false);
	});

	it("flags clipping without flagging meshes", () => {
		const json = JSON.stringify({
			skins: [{ name: "default", attachments: { body: { clip: { type: "clipping" } } } }],
		});
		const info = parseSkeletonInfo(json);
		expect([info.hasMeshes, info.hasClipping]).toEqual([false, true]);
	});

	it("names an unnamed skin default and tolerates null entries", () => {
		const json = JSON.stringify({ skins: [{ attachments: { body: { a: null } } }, null] });
		const info = parseSkeletonInfo(json);
		expect(info.skins).toEqual(["default", "default"]);
		expect(info.attachments).toBe(1);
		expect(info.hasMeshes).toBe(false);
	});

	it("reports zeros for a skeleton with no content", () => {
		expect(parseSkeletonInfo("{}")).toEqual({
			width: 0,
			height: 0,
			bones: 0,
			slots: 0,
			attachments: 0,
			skins: [],
			animations: [],
			constraints: { ik: 0, transform: 0, path: 0, physics: 0 },
			hasMeshes: false,
			hasClipping: false,
		});
	});

	it("ignores fields of the wrong shape", () => {
		const json = JSON.stringify({
			skeleton: { width: "100", height: null },
			bones: "root",
			slots: { body: {} },
			skins: "default",
			animations: "idle",
		});
		const info = parseSkeletonInfo(json);
		expect([info.width, info.height, info.bones, info.slots]).toEqual([0, 0, 0, 0]);
		expect(info.skins).toEqual([]);
		expect(info.animations).toEqual([]);
	});

	it("rejects text that is not JSON", () => {
		expect(() => parseSkeletonInfo("{")).toThrow("skeleton file is not valid JSON");
	});
});
