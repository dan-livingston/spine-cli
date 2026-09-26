import { describe, expect, it } from "vite-plus/test";

import type { Box, RenderRequest } from "#/render/harness/contract.ts";
import type { StubSessionOptions } from "#/test/harness-fixtures.ts";

import { framingBox } from "#/render/harness/framing.ts";
import { animationFor } from "#/render/harness/pose.ts";
import { still, stubSession } from "#/test/harness-fixtures.ts";

const declared = { x: -50, y: 0, width: 100, height: 200 };
const sliding = (time: number): Box => ({ x: time * 100, y: 0, width: 10, height: 10 });
const rising = (time: number): Box => ({ x: 0, y: time * 50, width: 20, height: 20 });

const DOOR = { x: 0, y: 0, width: 20, height: 40 };
const BG = { x: -100, y: -100, width: 300, height: 300 };

const scene: StubSessionOptions = {
	declared,
	slots: [
		{ name: "door", at: still(DOOR) },
		{ name: "coin", at: sliding },
		{ name: "gem", at: rising },
		{ name: "bg", at: still(BG) },
	],
};

function frame(options: StubSessionOptions, overrides: Partial<RenderRequest>) {
	const stub = stubSession(options);
	const req: RenderRequest = {
		animation: "idle",
		fps: 10,
		duration: 0,
		loops: 1,
		fit: "declared",
		background: { r: 0, g: 0, b: 0, a: 0 },
		...overrides,
	};
	return { box: framingBox(stub.session, req, animationFor(stub.session, "idle")), ...stub };
}

const close = (box: Box) => ({
	x: expect.closeTo(box.x, 9),
	y: expect.closeTo(box.y, 9),
	width: expect.closeTo(box.width, 9),
	height: expect.closeTo(box.height, 9),
});

describe("framingBox", () => {
	it("frames to the scaled declared box for fit declared, without posing", () => {
		const { box, records } = frame(
			{ ...scene, scale: 2 },
			{ fit: "declared", slots: ["coin"] },
		);
		expect(box).toEqual({ x: -100, y: 0, width: 200, height: 400 });
		expect(records.updates).toEqual([]);
	});

	it("frames fit bounds to every slot over every pose, not just the first", () => {
		const { box } = frame(
			{ declared, slots: [{ name: "coin", at: sliding }] },
			{ fit: "bounds", slots: ["coin"] },
		);
		expect(box).toEqual(close({ x: 0, y: 0, width: 100, height: 10 }));
	});

	it("frames fit bounds to the whole skeleton even for a piece", () => {
		const { box } = frame(scene, { fit: "bounds", slots: ["door"], groupSlots: ["door"] });
		expect(box).toEqual(BG);
	});

	it("gives each piece its own box with fit piece", () => {
		const groupSlots = ["door", "coin"];
		const door = frame(scene, { fit: "piece", slots: ["door"], groupSlots }).box;
		const coin = frame(scene, { fit: "piece", slots: ["coin"], groupSlots }).box;
		expect(door).toEqual(DOOR);
		expect(coin).toEqual(close({ x: 0, y: 0, width: 100, height: 10 }));
	});

	it("gives every piece the identical box with fit shared when the pieces move differently", () => {
		const groupSlots = ["coin", "gem"];
		const boxes = ["coin", "gem"].map(
			(slot) => frame(scene, { fit: "shared", slots: [slot], groupSlots }).box,
		);
		expect(boxes[0]).toEqual(boxes[1]);
		expect(boxes[0]).toEqual(close({ x: 0, y: 0, width: 100, height: 65 }));
	});

	it("falls back to the scaled declared box when the frame set shows nothing", () => {
		const options = { ...scene, scale: 2 };
		const scaled = { x: -100, y: 0, width: 200, height: 400 };
		expect(frame(options, { fit: "piece", slots: ["ghost"] }).box).toEqual(scaled);
		expect(frame({ declared, scale: 2, slots: [] }, { fit: "bounds" }).box).toEqual(scaled);
	});

	it("frames a looped clip as it wraps back to the start", () => {
		const { box, records } = frame(
			{ declared, slots: [{ name: "coin", at: sliding }] },
			{ fit: "bounds", loops: 2 },
		);
		expect(records.setAnimations[0].loop).toBe(true);
		expect(records.updates).toHaveLength(21);
		expect(box).toEqual(close({ x: 0, y: 0, width: 100, height: 10 }));
	});

	it("frames with the requested skin on", () => {
		const { records } = frame(scene, { fit: "bounds", skin: "gold", duration: 0.3 });
		expect(records.skins.length).toBeGreaterThan(0);
		expect(new Set(records.skins)).toEqual(new Set(["gold"]));
	});

	it("frames only the still time for a png", () => {
		const { box } = frame(
			{ declared, slots: [{ name: "coin", at: sliding }] },
			{ fit: "bounds", times: [0.5] },
		);
		expect(box).toEqual({ x: 50, y: 0, width: 10, height: 10 });
	});
});
