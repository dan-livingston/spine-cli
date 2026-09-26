import type { AnimationInfo } from "#/spine/animation-info.ts";

import { parseAnimations } from "#/spine/animation-info.ts";

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

	const animations = parseAnimations(data.animations);

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

function arr(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
