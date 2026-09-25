export interface AnimationInfo {
	name: string;
	duration: number;
}

export interface ConstraintCounts {
	ik: number;
	transform: number;
	path: number;
	physics: number;
}

export interface SkeletonInfo {
	width: number;
	height: number;
	bones: number;
	slots: number;
	attachments: number;
	skins: string[];
	animations: AnimationInfo[];
	constraints: ConstraintCounts;
	hasMeshes: boolean;
	hasClipping: boolean;
}

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

function normalizeSkins(raw: unknown): SkinShape[] {
	if (Array.isArray(raw)) return skinsFromArrayForm(raw);
	if (raw && typeof raw === "object") return skinsFromOlderObjectForm(raw);
	return [];
}

function skinsFromArrayForm(raw: unknown[]): SkinShape[] {
	return raw.map((s) => {
		const skin = (s ?? {}) as Record<string, unknown>;
		return {
			name: typeof skin.name === "string" ? skin.name : "default",
			attachments: attachmentsOf(skin.attachments),
		};
	});
}

function skinsFromOlderObjectForm(raw: object): SkinShape[] {
	return Object.entries(raw as Record<string, unknown>).map(([name, slots]) => ({
		name,
		attachments: attachmentsOf(slots),
	}));
}

function attachmentsOf(raw: unknown): SkinShape["attachments"] {
	if (raw && typeof raw === "object") return raw as SkinShape["attachments"];
	return {};
}

function normalizeAnimations(raw: unknown): AnimationInfo[] {
	if (!raw || typeof raw !== "object") return [];
	return Object.entries(raw as Record<string, unknown>).map(([name, anim]) => ({
		name,
		duration: round3(latestKeyframeTime(anim)),
	}));
}

function latestKeyframeTime(node: unknown): number {
	if (Array.isArray(node)) {
		return largest(node.map((v) => Math.max(timelineKeyTime(v), latestKeyframeTime(v))));
	}
	if (node && typeof node === "object") {
		return largest(Object.values(node).map(latestKeyframeTime));
	}
	return 0;
}

function largest(times: number[]): number {
	return times.reduce((max, t) => (t > max ? t : max), 0);
}

function timelineKeyTime(element: unknown): number {
	if (!element || typeof element !== "object" || Array.isArray(element)) return 0;
	const time = (element as Record<string, unknown>).time;
	return typeof time === "number" ? time : 0;
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
