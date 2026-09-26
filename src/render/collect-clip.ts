import type { Clip } from "#/ports/render-pool.ts";
import type { HarnessApi, RenderRequest } from "#/render/harness/contract.ts";

import { framesPerBatch } from "#/render/frame-batch.ts";

export type ClipHarness = Pick<HarnessApi, "startClip" | "nextFrames">;

export type FrameDecoder = (encoded: string) => Uint8Array;

export async function collectClip(
	harness: ClipHarness,
	id: number,
	req: RenderRequest,
	decode: FrameDecoder,
): Promise<Clip> {
	const clip = await harness.startClip(id, req);
	const maxFrames = framesPerBatch(clip.width, clip.height);
	const frames: Uint8Array[] = [];
	while (frames.length < clip.frameCount) {
		const batch = await harness.nextFrames(id, maxFrames);
		if (batch.length === 0) {
			throw new Error(
				`render stalled: session ${id} returned no frames after ${frames.length} of ${clip.frameCount}`,
			);
		}
		frames.push(...batch.map(decode));
	}
	return { width: clip.width, height: clip.height, frames };
}
