import { describe, expect, it } from "vite-plus/test";

import type { ClipHarness } from "#/render/collect-clip.ts";
import type { ClipInfo, RenderRequest } from "#/render/harness/contract.ts";

import { collectClip } from "#/render/collect-clip.ts";

const req: RenderRequest = {
	animation: "idle",
	fps: 30,
	duration: 0,
	loops: 1,
	fit: "declared",
	background: { r: 0, g: 0, b: 0, a: 0 },
};

const FOUR_PER_BATCH = { width: 2048, height: 2048 };
const ONE_PER_BATCH = { width: 8192, height: 4096 };

function scripted(info: ClipInfo, stallAfter = Infinity) {
	const asked: number[] = [];
	let sent = 0;
	const harness: ClipHarness = {
		startClip: async () => info,
		nextFrames: async (_id, maxFrames) => {
			asked.push(maxFrames);
			const count = sent >= stallAfter ? 0 : Math.min(maxFrames, info.frameCount - sent);
			const batch = Array.from({ length: count }, (_, i) => String(sent + i));
			sent += count;
			return batch;
		},
	};
	return { harness, asked };
}

const decode = (encoded: string): Uint8Array => new Uint8Array([Number(encoded)]);

const order = (frames: Uint8Array[]): number[] => frames.map((frame) => frame[0]);

describe("collectClip", () => {
	it("asks for a full batch and stops when a batch is exactly the clip", async () => {
		const { harness, asked } = scripted({ ...FOUR_PER_BATCH, frameCount: 4 });
		const clip = await collectClip(harness, 1, req, decode);
		expect(asked).toEqual([4]);
		expect(order(clip.frames)).toEqual([0, 1, 2, 3]);
		expect(clip).toMatchObject(FOUR_PER_BATCH);
	});

	it("pages through a frame count the batch size does not divide", async () => {
		const { harness, asked } = scripted({ ...FOUR_PER_BATCH, frameCount: 10 });
		const clip = await collectClip(harness, 1, req, decode);
		expect(asked).toEqual([4, 4, 4]);
		expect(order(clip.frames)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it("fetches a frame bigger than the batch budget one at a time", async () => {
		const { harness, asked } = scripted({ ...ONE_PER_BATCH, frameCount: 3 });
		const clip = await collectClip(harness, 1, req, decode);
		expect(asked).toEqual([1, 1, 1]);
		expect(order(clip.frames)).toEqual([0, 1, 2]);
	});

	it("fails instead of looping forever when a batch comes back empty early", async () => {
		const { harness, asked } = scripted({ ...FOUR_PER_BATCH, frameCount: 10 }, 4);
		await expect(collectClip(harness, 7, req, decode)).rejects.toThrow(
			"render stalled: session 7 returned no frames after 4 of 10",
		);
		expect(asked).toEqual([4, 4]);
	});

	it("passes the session and request through to the harness", async () => {
		const seen: unknown[] = [];
		const harness: ClipHarness = {
			startClip: async (id, r) => {
				seen.push(["start", id, r]);
				return { width: 1, height: 1, frameCount: 1 };
			},
			nextFrames: async (id) => {
				seen.push(["next", id]);
				return ["5"];
			},
		};
		await collectClip(harness, 3, req, decode);
		expect(seen).toEqual([
			["start", 3, req],
			["next", 3],
		]);
	});
});
