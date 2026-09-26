import type * as spine42 from "spine-webgl-42";

import type { Box, RenderRequest } from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";

import { boundsOf, declaredBoxScaled, unionBox } from "#/render/harness/box.ts";
import { clipTimes, detachSlotsOutside, forEachPose, restartClip } from "#/render/harness/pose.ts";

export function framingBox(s: Session, req: RenderRequest, anim: spine42.Animation): Box {
	if (req.fit === "declared") return declaredBoxScaled(s);
	const frameSet = frameSlots(req);
	restartClip(s, req, anim);
	let union: Box | null = null;
	forEachPose(s, req.skin, clipTimes(req, anim), () => {
		detachSlotsOutside(s, frameSet);
		union = unionBox(union, boundsOf(s));
	});
	return union ?? declaredBoxScaled(s);
}

function frameSlots(req: RenderRequest): string[] | undefined {
	if (req.fit === "piece") return req.slots;
	if (req.fit === "shared") return req.groupSlots ?? req.slots;
	return undefined;
}
