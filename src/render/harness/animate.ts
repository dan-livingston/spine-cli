import type * as spine42 from "spine-webgl-42";

import type {
	Box,
	ClipTiming,
	MeasureRequest,
	MeasureResult,
	RenderRequest,
	RenderResult,
} from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";

import {
	boundsOf,
	declaredBoxScaled,
	frameBox,
	outputSize,
	unionBox,
} from "#/render/harness/box.ts";
import { containBoxInView, renderFrame, sizeCanvas } from "#/render/harness/draw.ts";
import { sessionFor } from "#/render/harness/session.ts";

function animationFor(s: Session, name: string): spine42.Animation {
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

function clipTimes(req: ClipTiming, anim: spine42.Animation): number[] {
	return req.times ?? frameTimes(anim.duration, req.duration, req.fps, req.loops);
}

function poseAfter(s: Session, skin: string | undefined, delta: number): void {
	s.skeleton.setToSetupPose();
	applySkin(s, skin);
	s.state.update(delta);
	s.state.apply(s.skeleton);
	s.skeleton.updateWorldTransform();
}

function forEachPose(
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

export async function renderAnimation(id: number, req: RenderRequest): Promise<RenderResult> {
	const s = sessionFor(id);
	const anim = animationFor(s, req.animation);

	applySkin(s, req.skin);
	s.state.setAnimation(0, req.animation, clipRunsPastAnimation(req, anim));
	poseAfter(s, undefined, 0);

	const box = req.box ?? frameBox(s, req.fit);
	const size = outputSize(box, req.width, req.height);
	sizeCanvas(s, size.width, size.height);
	containBoxInView(s, box, size.width, size.height);

	const frames: string[] = [];
	forEachPose(s, req.skin, clipTimes(req, anim), () => {
		detachSlotsOutsidePiece(s, req.slots);
		frames.push(renderFrame(s, size.width, size.height, req));
	});
	return { width: size.width, height: size.height, frames };
}

function detachSlotsOutsidePiece(s: Session, slots: string[] | undefined): void {
	if (!slots) return;
	const keep = new Set(slots);
	for (const slot of s.skeleton.slots) {
		if (!keep.has(slot.data.name)) slot.setAttachment(null);
	}
}

export async function measurePieces(id: number, req: MeasureRequest): Promise<MeasureResult> {
	const s = sessionFor(id);
	const anim = animationFor(s, req.animation);

	applySkin(s, req.skin);
	const loop = clipRunsPastAnimation(req, anim);
	const times = clipTimes(req, anim);

	const measureWholeSkeleton = req.fit === "bounds";
	const measureEachPiece = req.fit === "piece" || req.fit === "shared";
	const pieceSets = req.pieces.map((names) => new Set(names));
	const perPiece: (Box | null)[] = req.pieces.map(() => null);
	let skeletonUnion: Box | null = null;

	s.skeleton.setToSetupPose();
	s.state.setAnimation(0, req.animation, loop);

	forEachPose(s, req.skin, times, () => {
		if (measureWholeSkeleton) skeletonUnion = unionBox(skeletonUnion, boundsOf(s));
		if (measureEachPiece) growPieceBoxes(s, pieceSets, perPiece);
	});

	const declared = declaredBoxScaled(s);
	const selectedUnion = perPiece.reduce<Box | null>((union, b) => unionBox(union, b), null);

	return {
		perPiece: perPiece.map((b) => b ?? declared),
		selectedUnion: selectedUnion ?? declared,
		skeletonUnion: skeletonUnion ?? declared,
		declared,
	};
}

function growPieceBoxes(s: Session, pieceSets: Set<string>[], perPiece: (Box | null)[]): void {
	const slots = s.skeleton.slots;
	const saved = slots.map((sl) => sl.getAttachment());
	for (let i = 0; i < pieceSets.length; i++) {
		const keep = pieceSets[i];
		for (let j = 0; j < slots.length; j++) {
			slots[j].setAttachment(keep.has(slots[j].data.name) ? saved[j] : null);
		}
		perPiece[i] = unionBox(perPiece[i], boundsOf(s));
	}
	for (let j = 0; j < slots.length; j++) slots[j].setAttachment(saved[j]);
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
