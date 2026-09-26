import { describe, expect, it, vi } from "vite-plus/test";

import type { Session } from "#/render/harness/session.ts";

import { collectClip } from "#/render/collect-clip.ts";
import { nextFrames, startClip } from "#/render/harness/animate.ts";
import { stubSession } from "#/test/harness-fixtures.ts";

const registry = vi.hoisted(() => new Map<number, unknown>());

vi.mock("#/render/harness/session.ts", () => ({
	sessionFor(id: number) {
		const s = registry.get(id);
		if (!s) throw new Error(`unknown session ${id}`);
		return s;
	},
}));

const decode = (frame: string): Uint8Array =>
	Uint8Array.from(atob(frame), (ch) => ch.charCodeAt(0));

describe("collectClip over the harness", () => {
	it("collects every frame of a clip with its pixels", async () => {
		const { session, records } = stubSession({ declared: { x: 0, y: 0, width: 3, height: 2 } });
		registry.set(1, session as Session);
		const clip = await collectClip(
			{ startClip, nextFrames },
			1,
			{
				animation: "idle",
				fps: 10,
				duration: 0,
				loops: 1,
				fit: "declared",
				background: { r: 1, g: 0, b: 0, a: 1 },
			},
			decode,
		);

		expect(clip.width).toBe(3);
		expect(clip.height).toBe(2);
		expect(clip.frames).toHaveLength(10);
		expect(records.draws).toHaveLength(10);
		for (const frame of clip.frames) {
			expect(Array.from(frame)).toEqual(
				Array.from({ length: 6 }, () => [255, 0, 0, 255]).flat(),
			);
		}
	});
});
