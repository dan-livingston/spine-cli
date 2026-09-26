import type { ClipInfo, RenderRequest } from "#/render/harness/contract.ts";

import { outputSize } from "#/render/harness/box.ts";
import { containBoxInView, renderFrame, sizeCanvas } from "#/render/harness/draw.ts";
import { framingBox } from "#/render/harness/framing.ts";
import {
	animationFor,
	clipTimes,
	detachSlotsOutside,
	poseAfter,
	restartClip,
} from "#/render/harness/pose.ts";
import { sessionFor } from "#/render/harness/session.ts";

export async function startClip(id: number, req: RenderRequest): Promise<ClipInfo> {
	const s = sessionFor(id);
	const anim = animationFor(s, req.animation);

	const box = framingBox(s, req, anim);
	restartClip(s, req, anim);
	const size = outputSize(box, req.width, req.height);
	sizeCanvas(s, size.width, size.height);
	containBoxInView(s, box, size.width, size.height);

	const times = clipTimes(req, anim);
	s.clip = { req, times, next: 0, prev: 0, width: size.width, height: size.height };
	return { width: size.width, height: size.height, frameCount: times.length };
}

export async function nextFrames(id: number, maxFrames: number): Promise<string[]> {
	const s = sessionFor(id);
	const clip = s.clip;
	if (!clip) throw new Error(`no clip started in session ${id}`);
	const end = Math.min(clip.times.length, clip.next + Math.max(1, maxFrames));
	const frames: string[] = [];
	for (; clip.next < end; clip.next++) {
		const t = clip.times[clip.next];
		poseAfter(s, clip.req.skin, t - clip.prev);
		clip.prev = t;
		detachSlotsOutside(s, clip.req.slots);
		frames.push(renderFrame(s, clip.width, clip.height, clip.req));
	}
	return frames;
}
