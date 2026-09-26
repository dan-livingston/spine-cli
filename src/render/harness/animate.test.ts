import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Box, ClipTiming, RenderRequest } from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";
import type { StubSessionOptions } from "#/test/harness-fixtures.ts";

import { nextFrames, startClip } from "#/render/harness/animate.ts";
import { decodeFrame, still, stubSession } from "#/test/harness-fixtures.ts";

const registry = vi.hoisted(() => new Map<number, unknown>());

vi.mock("#/render/harness/session.ts", () => ({
	sessionFor(id: number) {
		const s = registry.get(id);
		if (!s) throw new Error(`unknown session ${id}`);
		return s;
	},
}));

beforeEach(() => registry.clear());

function open(options: StubSessionOptions = {}) {
	const stub = stubSession(options);
	registry.set(1, stub.session as Session);
	return stub;
}

const timing: ClipTiming = { animation: "idle", fps: 10, duration: 0, loops: 1, fit: "declared" };

const BATCH = 3;

async function render(overrides: Partial<RenderRequest> = {}): Promise<{
	width: number;
	height: number;
	frames: string[];
}> {
	const clip = await startClip(1, {
		...timing,
		background: { r: 0, g: 0, b: 0, a: 0 },
		...overrides,
	});
	const frames: string[] = [];
	while (frames.length < clip.frameCount) frames.push(...(await nextFrames(1, BATCH)));
	return { width: clip.width, height: clip.height, frames };
}

const sliding = (time: number): Box => ({ x: time * 100, y: 0, width: 10, height: 10 });
const declared = { x: -50, y: 0, width: 100, height: 200 };

describe("clip timing", () => {
	it("renders one frame per 1/fps over the animation length", async () => {
		const { records } = open();
		const clip = await render();
		expect(clip.frames).toHaveLength(10);
		expect(records.draws.map((d) => d.time)).toEqual(
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => expect.closeTo(i / 10, 9)),
		);
		expect(records.setAnimations).toEqual([{ track: 0, name: "idle", loop: false }]);
	});

	it("plays the animation n times for loops", async () => {
		const { records } = open();
		const clip = await render({ loops: 3 });
		expect(clip.frames).toHaveLength(30);
		expect(records.setAnimations[0].loop).toBe(true);
		expect(records.updates.reduce((sum, d) => sum + d, 0)).toBeCloseTo(2.9, 9);
	});

	it("loops when the duration runs past the animation", async () => {
		const { records } = open();
		const clip = await render({ duration: 2.5 });
		expect(clip.frames).toHaveLength(25);
		expect(records.setAnimations[0].loop).toBe(true);
	});

	it("cuts the clip short without looping for a shorter duration", async () => {
		const { records } = open();
		const clip = await render({ duration: 0.5 });
		expect(clip.frames).toHaveLength(5);
		expect(records.setAnimations[0].loop).toBe(false);
	});

	it("does not loop when the duration equals the animation length", async () => {
		const { records } = open();
		const clip = await render({ duration: 1 });
		expect(clip.frames).toHaveLength(10);
		expect(records.setAnimations[0].loop).toBe(false);
	});

	it("rounds the frame count to the nearest whole frame", async () => {
		open({ animations: [{ name: "idle", duration: 0.1 }] });
		expect((await render({ fps: 24 })).frames).toHaveLength(2);
		expect((await render({ fps: 36 })).frames).toHaveLength(4);
	});

	it("still renders one frame for a zero-length animation", async () => {
		open({ animations: [{ name: "idle", duration: 0 }] });
		expect((await render()).frames).toHaveLength(1);
	});

	it("renders exactly the requested times for a still", async () => {
		const { records } = open();
		const clip = await render({ times: [0.5], loops: 3, duration: 4 });
		expect(clip.frames).toHaveLength(1);
		expect(records.draws.map((d) => d.time)).toEqual([0.5]);
		expect(records.setAnimations[0].loop).toBe(false);
	});

	it("names an animation the skeleton does not have", async () => {
		open();
		await expect(render({ animation: "run" })).rejects.toThrow("animation not found: run");
	});

	it("names a session that does not exist", async () => {
		await expect(render()).rejects.toThrow("unknown session 1");
	});
});

describe("clip batches", () => {
	it("reports the frame count up front and renders nothing until asked", async () => {
		const { records } = open();
		const clip = await startClip(1, { ...timing, background: { r: 0, g: 0, b: 0, a: 0 } });
		expect(clip.frameCount).toBe(10);
		expect(records.draws).toEqual([]);
	});

	it("carries on from the last batch and stops at the end of the clip", async () => {
		open();
		await startClip(1, { ...timing, background: { r: 0, g: 0, b: 0, a: 0 } });
		expect(await nextFrames(1, 4)).toHaveLength(4);
		expect(await nextFrames(1, 4)).toHaveLength(4);
		expect(await nextFrames(1, 4)).toHaveLength(2);
		expect(await nextFrames(1, 4)).toEqual([]);
	});

	it("renders at least one frame per batch", async () => {
		open();
		await startClip(1, { ...timing, background: { r: 0, g: 0, b: 0, a: 0 } });
		expect(await nextFrames(1, 0)).toHaveLength(1);
	});

	it("rejects frames before a clip is started", async () => {
		open();
		await expect(nextFrames(1, 1)).rejects.toThrow("no clip started in session 1");
	});
});

describe("clip content", () => {
	it("applies the requested skin on every frame", async () => {
		const { records } = open();
		await render({ skin: "gold", duration: 0.3 });
		expect(records.draws.map((d) => d.skin)).toEqual(["gold", "gold", "gold"]);
	});

	it("draws only the slots of the piece on every frame", async () => {
		const { records } = open({
			slots: [
				{ name: "body", at: still(declared) },
				{ name: "hat", at: still(declared) },
				{ name: "cape", at: still(declared) },
			],
		});
		await render({ slots: ["hat", "cape"], duration: 0.3 });
		expect(records.draws.map((d) => d.attached)).toEqual([
			["hat", "cape"],
			["hat", "cape"],
			["hat", "cape"],
		]);
	});

	it("draws every slot without a piece", async () => {
		const { records } = open({
			slots: [
				{ name: "body", at: still(declared) },
				{ name: "hat", at: still(declared) },
			],
		});
		await render({ duration: 0.1 });
		expect(records.draws[0].attached).toEqual(["body", "hat"]);
	});
});

describe("clip framing", () => {
	it("sizes the output to the scaled declared box by default", async () => {
		const { camera } = open({ declared, scale: 0.5 });
		const clip = await render();
		expect(clip).toMatchObject({ width: 50, height: 100 });
		expect(decodeFrame(clip.frames[0])).toHaveLength(50 * 100 * 4);
		expect(camera.position).toEqual({ x: 0, y: 50 });
	});

	it("keeps the box ratio when only a width is given", async () => {
		open({ declared });
		expect(await render({ width: 30 })).toMatchObject({ width: 30, height: 60 });
	});

	it("frames a piece to its own slots and still draws only them", async () => {
		const { records } = open({
			declared,
			slots: [
				{ name: "coin", at: sliding },
				{ name: "bg", at: still({ x: -100, y: -100, width: 300, height: 300 }) },
			],
		});
		const clip = await render({ fit: "piece", slots: ["coin"], duration: 0.3 });
		expect(clip).toMatchObject({ width: 30, height: 10 });
		expect(records.draws.map((d) => d.attached)).toEqual([["coin"], ["coin"], ["coin"]]);
	});

	it("frames fit bounds to every pose of the clip", async () => {
		const { records } = open({ declared, slots: [{ name: "coin", at: sliding }] });
		const clip = await render({ fit: "bounds" });
		expect(clip).toMatchObject({ width: 100, height: 10 });
		expect(records.draws.map((d) => d.time)).toEqual(
			[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => expect.closeTo(i / 10, 9)),
		);
	});
});
