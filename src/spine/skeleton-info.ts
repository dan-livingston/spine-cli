// parse a skeleton json string into structured, render-agnostic info. works for
// both 4.0 and 4.2 exports; shape differences (skins array vs object, physics
// only in 4.2) are handled here.

export interface AnimationInfo {
	name: string;
	// duration in seconds, = max keyframe time in the animation
	duration: number;
}

export interface ConstraintCounts {
	ik: number;
	transform: number;
	path: number;
	physics: number;
}

export interface SkeletonInfo {
	// declared skeleton size from skeleton.width/height (0 if absent)
	width: number;
	height: number;
	bones: number;
	slots: number;
	// total attachment entries summed across all skins
	attachments: number;
	skins: string[];
	animations: AnimationInfo[];
	constraints: ConstraintCounts;
	hasMeshes: boolean;
	hasClipping: boolean;
}

// walk one skin's attachments regardless of 4.x shape. a skin is either
// { name, attachments: { slot: { attachment: {type?} } } } (4.x array form) or a
// bare { slot: { attachment: {type?} } } (older 4.0 object form).
interface SkinShape {
	name: string;
	attachments: Record<string, Record<string, { type?: string }>>;
}

export function parseSkeletonInfo(jsonText: string): SkeletonInfo {
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(jsonText) as Record<string, unknown>;
	} catch {
		throw new Error("skeleton file is not valid JSON");
	}

	const skeleton = (data.skeleton as Record<string, unknown> | undefined) ?? {};
	const width = num(skeleton.width);
	const height = num(skeleton.height);

	const bones = arr(data.bones).length;
	const slots = arr(data.slots).length;

	const skinList = normalizeSkins(data.skins);

	let attachments = 0;
	let hasMeshes = false;
	let hasClipping = false;
	for (const skin of skinList) {
		for (const slot of Object.values(skin.attachments)) {
			for (const attachment of Object.values(slot)) {
				attachments++;
				const type = attachment?.type ?? "region";
				if (type === "mesh" || type === "linkedmesh") hasMeshes = true;
				else if (type === "clipping") hasClipping = true;
			}
		}
	}

	const animations = normalizeAnimations(data.animations);

	return {
		width,
		height,
		bones,
		slots,
		attachments,
		skins: skinList.map((s) => s.name),
		animations,
		constraints: {
			ik: arr(data.ik).length,
			transform: arr(data.transform).length,
			path: arr(data.path).length,
			physics: arr(data.physics).length,
		},
		hasMeshes,
		hasClipping,
	};
}

// coerce skins into a uniform array of { name, attachments } across both shapes.
function normalizeSkins(raw: unknown): SkinShape[] {
	if (Array.isArray(raw)) {
		return raw.map((s) => {
			const skin = (s ?? {}) as Record<string, unknown>;
			return {
				name: typeof skin.name === "string" ? skin.name : "default",
				attachments: attachmentsOf(skin.attachments),
			};
		});
	}
	if (raw && typeof raw === "object") {
		// older 4.0 object form: { skinName: { slot: {...} } }
		return Object.entries(raw as Record<string, unknown>).map(([name, slots]) => ({
			name,
			attachments: attachmentsOf(slots),
		}));
	}
	return [];
}

function attachmentsOf(raw: unknown): SkinShape["attachments"] {
	if (raw && typeof raw === "object") return raw as SkinShape["attachments"];
	return {};
}

function normalizeAnimations(raw: unknown): AnimationInfo[] {
	if (!raw || typeof raw !== "object") return [];
	return Object.entries(raw as Record<string, unknown>).map(([name, anim]) => ({
		name,
		duration: round3(maxTime(anim)),
	}));
}

// deep-walk any animation subtree and return the largest keyframe time. keyframes
// are always elements of a timeline array (the first at 0 may omit its time), so
// the max keyframe time is the animation duration. reading time only from array
// elements avoids inflation from a stray non-timeline "time" property. works
// across 4.0 and 4.2 timeline shapes.
function maxTime(node: unknown): number {
	let max = 0;
	if (Array.isArray(node)) {
		for (const v of node) {
			if (v && typeof v === "object" && !Array.isArray(v)) {
				const t = (v as Record<string, unknown>).time;
				if (typeof t === "number" && t > max) max = t;
			}
			const t = maxTime(v);
			if (t > max) max = t;
		}
	} else if (node && typeof node === "object") {
		for (const value of Object.values(node)) {
			const t = maxTime(value);
			if (t > max) max = t;
		}
	}
	return max;
}

function arr(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round3(n: number): number {
	return Math.round(n * 1000) / 1000;
}
