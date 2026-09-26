export interface TimelineCounts {
	bones: number;
	slots: number;
	deform: number;
	drawOrder: number;
	ik: number;
	transform: number;
	path: number;
	physics: number;
}

export interface AnimationInfo {
	name: string;
	duration: number;
	timelines: TimelineCounts;
	events: string[];
}

type Json = Record<string, unknown>;

export function parseAnimations(raw: unknown): AnimationInfo[] {
	return Object.entries(record(raw)).map(([name, anim]) => ({
		name,
		duration: round3(latestKeyframeTime(anim)),
		timelines: countTimelines(record(anim)),
		events: eventNames(record(anim).events),
	}));
}

function countTimelines(anim: Json): TimelineCounts {
	return {
		bones: timelinesPerTarget(anim.bones),
		slots: timelinesPerTarget(anim.slots),
		deform: deformIn40Layout(anim.deform) + deformIn41Layout(anim.attachments),
		drawOrder: Array.isArray(anim.drawOrder ?? anim.draworder) ? 1 : 0,
		ik: Object.keys(record(anim.ik)).length,
		transform: Object.keys(record(anim.transform)).length,
		path: timelinesPerTarget(anim.path),
		physics: timelinesPerTarget(anim.physics),
	};
}

function timelinesPerTarget(raw: unknown): number {
	return sum(Object.values(record(raw)).map((target) => Object.keys(record(target)).length));
}

function deformIn40Layout(raw: unknown): number {
	return sum(
		attachmentsBySkinAndSlot(raw).map((attachment) => (Array.isArray(attachment) ? 1 : 0)),
	);
}

function deformIn41Layout(raw: unknown): number {
	return sum(
		attachmentsBySkinAndSlot(raw).map((attachment) =>
			Array.isArray(record(attachment).deform) ? 1 : 0,
		),
	);
}

function attachmentsBySkinAndSlot(raw: unknown): unknown[] {
	return Object.values(record(raw)).flatMap((skin) =>
		Object.values(record(skin)).flatMap((slot) => Object.values(record(slot))),
	);
}

function eventNames(raw: unknown): string[] {
	const names = (Array.isArray(raw) ? raw : []).map((key) => record(key).name);
	return [...new Set(names.filter((name): name is string => typeof name === "string"))];
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
	const time = (element as Json).time;
	return typeof time === "number" ? time : 0;
}

function record(value: unknown): Json {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function sum(values: number[]): number {
	return values.reduce((total, n) => total + n, 0);
}

function round3(n: number): number {
	return Math.round(n * 1000) / 1000;
}
