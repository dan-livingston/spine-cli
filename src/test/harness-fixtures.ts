import type { Box } from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";

export type SlotMotion = (time: number) => Box | null;

export interface StubSlotSpec {
	name: string;
	at: SlotMotion;
}

export interface StubSessionOptions {
	slots?: StubSlotSpec[];
	animations?: { name: string; duration: number }[];
	declared?: Box;
	scale?: number;
	premultiplied?: boolean;
	pixels?: (w: number, h: number) => Uint8Array;
}

export interface StubRecords {
	setAnimations: { track: number; name: string; loop: boolean }[];
	updates: number[];
	skins: string[];
	draws: { time: number; attached: string[]; skin: string | null }[];
	viewport: { w: number; h: number } | null;
	clearColor: [number, number, number, number] | null;
}

export interface StubSession {
	session: Session;
	records: StubRecords;
	camera: {
		zoom: number;
		position: { x: number; y: number };
		viewport: { w: number; h: number };
	};
	canvas: { width: number; height: number };
}

class Vector2 {
	x = 0;
	y = 0;
}

class StubSlot {
	attachment: object | null = null;
	readonly data: { name: string };
	constructor(
		name: string,
		readonly skeleton: StubSkeleton,
		readonly at: SlotMotion,
	) {
		this.data = { name };
	}
	getAttachment(): object | null {
		return this.attachment;
	}
	setAttachment(a: object | null): void {
		this.attachment = a;
	}
	currentBox(): Box | null {
		return this.attachment ? this.at(this.skeleton.time) : null;
	}
}

class StubSkeleton {
	time = 0;
	skin: string | null = null;
	readonly slots: StubSlot[];
	constructor(
		specs: StubSlotSpec[],
		readonly records: StubRecords,
	) {
		this.slots = specs.map((spec) => new StubSlot(spec.name, this, spec.at));
		this.setSlotsToSetupPose();
	}
	setToSetupPose(): void {
		this.setSlotsToSetupPose();
	}
	setSlotsToSetupPose(): void {
		for (const slot of this.slots) slot.setAttachment({ slot: slot.data.name });
	}
	setSkinByName(name: string): void {
		this.skin = name;
		this.records.skins.push(name);
	}
	updateWorldTransform(): void {}
	getBounds(offset: Vector2, size: Vector2): void {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (const slot of this.slots) {
			const b = slot.currentBox();
			if (!b) continue;
			x0 = Math.min(x0, b.x);
			y0 = Math.min(y0, b.y);
			x1 = Math.max(x1, b.x + b.width);
			y1 = Math.max(y1, b.y + b.height);
		}
		const empty = x0 === Infinity;
		offset.x = empty ? Infinity : x0;
		offset.y = empty ? Infinity : y0;
		size.x = empty ? -Infinity : x1 - x0;
		size.y = empty ? -Infinity : y1 - y0;
	}
}

class StubState {
	time = 0;
	duration = 0;
	loop = false;
	constructor(
		readonly records: StubRecords,
		readonly animations: { name: string; duration: number }[],
	) {}
	setAnimation(track: number, name: string, loop: boolean): void {
		this.time = 0;
		this.loop = loop;
		this.duration = this.animations.find((a) => a.name === name)?.duration ?? 0;
		this.records.setAnimations.push({ track, name, loop });
	}
	update(delta: number): void {
		this.time += delta;
		this.records.updates.push(delta);
	}
	apply(skeleton: StubSkeleton): void {
		skeleton.time = this.animationTime();
	}
	animationTime(): number {
		if (this.duration <= 0) return 0;
		return this.loop ? this.time % this.duration : Math.min(this.time, this.duration);
	}
}

function fillWithClearColor(buf: Uint8Array, color: [number, number, number, number]): void {
	for (let i = 0; i < buf.length; i += 4) {
		for (let c = 0; c < 4; c++) buf[i + c] = Math.round(color[c] * 255);
	}
}

export function stubSession(options: StubSessionOptions = {}): StubSession {
	const records: StubRecords = {
		setAnimations: [],
		updates: [],
		skins: [],
		draws: [],
		viewport: null,
		clearColor: null,
	};
	const animations = options.animations ?? [{ name: "idle", duration: 1 }];
	const declared = options.declared ?? { x: -50, y: 0, width: 100, height: 200 };
	const skeleton = new StubSkeleton(options.slots ?? [], records);
	const state = new StubState(records, animations);
	const canvas = { width: 16, height: 16 };
	const camera = {
		zoom: 1,
		position: { x: 0, y: 0 },
		viewport: { w: 0, h: 0 },
		setViewport(w: number, h: number) {
			camera.viewport = { w, h };
		},
		update() {},
	};
	const renderer = {
		camera,
		begin() {},
		end() {},
		drawSkeleton(sk: StubSkeleton) {
			const attached = sk.slots.filter((s) => s.attachment).map((s) => s.data.name);
			records.draws.push({ time: sk.time, attached, skin: sk.skin });
		},
	};
	const gl = {
		COLOR_BUFFER_BIT: 0x4000,
		RGBA: 0x1908,
		UNSIGNED_BYTE: 0x1401,
		viewport(_x: number, _y: number, w: number, h: number) {
			records.viewport = { w, h };
		},
		clearColor(r: number, g: number, b: number, a: number) {
			records.clearColor = [r, g, b, a];
		},
		clear() {},
		readPixels(
			_x: number,
			_y: number,
			w: number,
			h: number,
			_f: number,
			_t: number,
			buf: Uint8Array,
		) {
			if (options.pixels) buf.set(options.pixels(w, h));
			else if (records.clearColor) fillWithClearColor(buf, records.clearColor);
		},
	};
	const skeletonData = {
		...declared,
		findAnimation: (name: string) => animations.find((a) => a.name === name) ?? null,
	};
	const session = {
		spine: { Vector2 },
		canvas,
		gl,
		renderer,
		skeleton,
		skeletonData,
		state,
		stateData: {},
		scale: options.scale ?? 1,
		atlasIsPremultiplied: options.premultiplied ?? false,
	} as unknown as Session;
	return { session, records, camera, canvas };
}

export function still(box: Box): SlotMotion {
	return () => box;
}

export function decodeFrame(frame: string): number[] {
	return Array.from(atob(frame), (ch) => ch.charCodeAt(0));
}
