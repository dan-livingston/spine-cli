import type * as spine42 from "spine-webgl-42";

import type { ClipTiming } from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";

export function animationFor(s: Session, name: string): spine42.Animation {
	const anim = s.skeletonData.findAnimation(name);
	if (!anim) throw new Error(`animation not found: ${name}`);
	return anim;
}

function applySkin(s: Session, skin: string | undefined): void {
	if (skin) {
		s.skeleton.setSkinByName(skin);
		s.skeleton.setSlotsToSetupPose();
	}
}

function clipRunsPastAnimation(req: ClipTiming, anim: spine42.Animation): boolean {
	return req.times === undefined && (req.loops > 1 || req.duration > anim.duration);
}

export function clipTimes(req: ClipTiming, anim: spine42.Animation): number[] {
	return req.times ?? frameTimes(anim.duration, req.duration, req.fps, req.loops);
}

export function poseAfter(s: Session, skin: string | undefined, delta: number): void {
	s.skeleton.setToSetupPose();
	applySkin(s, skin);
	s.state.update(delta);
	s.state.apply(s.skeleton);
	s.skeleton.updateWorldTransform();
}

export function restartClip(s: Session, req: ClipTiming, anim: spine42.Animation): void {
	applySkin(s, req.skin);
	s.state.setAnimation(0, req.animation, clipRunsPastAnimation(req, anim));
	poseAfter(s, undefined, 0);
}

export function forEachPose(
	s: Session,
	skin: string | undefined,
	times: number[],
	visit: () => void,
): void {
	let prev = 0;
	for (const t of times) {
		poseAfter(s, skin, t - prev);
		prev = t;
		visit();
	}
}

export function detachSlotsOutside(s: Session, slots: string[] | undefined): void {
	if (!slots) return;
	const keep = new Set(slots);
	for (const slot of s.skeleton.slots) {
		if (!keep.has(slot.data.name)) slot.setAttachment(null);
	}
}

function frameTimes(
	animDuration: number,
	reqDuration: number,
	fps: number,
	loops: number,
): number[] {
	const base = reqDuration > 0 ? reqDuration : animDuration;
	const total = base * Math.max(1, loops);
	const count = Math.max(1, Math.round(total * fps));
	const dt = 1 / fps;
	const times: number[] = [];
	for (let i = 0; i < count; i++) times.push(i * dt);
	return times;
}
