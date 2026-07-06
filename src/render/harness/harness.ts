// browser-side spine renderer. bundled to dist-harness/harness.js as an iife by
// scripts/build-harness.mjs and injected into a headless page by the node driver.
// both spine-webgl runtimes are imported (4.0.28 + 4.2.7, each pinned to its own
// matching core via pnpm overrides); pick one per skeleton by the json version.
import * as spine40 from "spine-webgl-40";
import * as spine42 from "spine-webgl-42";

type Spine = typeof spine42;

// config passed from node to set up one skeleton on the page.
interface SessionConfig {
	major: "4.0" | "4.2";
	jsonText: string;
	atlasText: string;
	// atlas page image name -> data url (png/whatever)
	pages: { name: string; dataUrl: string }[];
	scale: number;
}

interface AnimationMeta {
	name: string;
	duration: number;
}

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface SessionMeta {
	animations: AnimationMeta[];
	skins: string[];
	slots: string[];
	declared: Box;
}

// per-animation render request.
interface RenderRequest {
	animation: string;
	skin?: string;
	fps: number;
	// clip length in seconds; frames = round(duration * fps), min 1
	duration: number;
	loops: number;
	// explicit still times in seconds (for --format png); overrides duration/fps
	times?: number[];
	fit: "declared" | "bounds" | "piece" | "shared";
	// only draw these slots (a piece); rest are detached before drawing
	slots?: string[];
	// explicit framing box (scaled space); overrides fit when set
	box?: Box;
	width?: number;
	height?: number;
	// clear color, 0..1
	background: { r: number; g: number; b: number; a: number };
	premultipliedAlpha: boolean;
}

// measure the framing boxes a set of pieces occupy over a whole clip. cheap: no
// pixel readback. node picks one of these per --fit to keep pieces aligned.
interface MeasureRequest {
	animation: string;
	skin?: string;
	fps: number;
	duration: number;
	loops: number;
	times?: number[];
	// which framing box node will read; only that one is measured
	fit: "declared" | "bounds" | "piece" | "shared";
	// resolved slot names per piece, in the same order as the render jobs
	pieces: string[][];
}

interface MeasureResult {
	// tight box for each piece, union over every frame
	perPiece: Box[];
	// union of every selected piece
	selectedUnion: Box;
	// union of the whole skeleton (all slots)
	skeletonUnion: Box;
	declared: Box;
}

interface RenderResult {
	width: number;
	height: number;
	// one base64 rgba (top-down, w*h*4 bytes) per frame
	frames: string[];
}

interface Session {
	spine: Spine;
	canvas: HTMLCanvasElement;
	gl: WebGL2RenderingContext | WebGLRenderingContext;
	renderer: spine42.SceneRenderer;
	skeleton: spine42.Skeleton;
	skeletonData: spine42.SkeletonData;
	state: spine42.AnimationState;
	stateData: spine42.AnimationStateData;
	// json scale applied to geometry; declared box is stored unscaled
	scale: number;
}

const sessions = new Map<number, Session>();
let nextId = 1;

function pickSpine(major: "4.0" | "4.2"): Spine {
	return major === "4.0" ? (spine40 as unknown as Spine) : spine42;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("failed to load atlas page image"));
		img.src = dataUrl;
	});
}

// build a skeleton on a fresh webgl canvas. size is provisional; the real output
// size is set per render once we know the framing box.
async function createSession(config: SessionConfig): Promise<{ id: number; meta: SessionMeta }> {
	const spine = pickSpine(config.major);

	const canvas = document.createElement("canvas");
	canvas.width = 16;
	canvas.height = 16;
	const gl = (canvas.getContext("webgl2") ||
		canvas.getContext("webgl")) as WebGL2RenderingContext | null;
	if (!gl) throw new Error("could not get a webgl2/webgl context");

	const renderer = new spine.SceneRenderer(canvas, gl);

	const atlas = new spine.TextureAtlas(config.atlasText);
	for (const page of atlas.pages) {
		const match = config.pages.find((p) => p.name === page.name);
		if (!match) throw new Error(`atlas page image not provided: ${page.name}`);
		const image = await loadImage(match.dataUrl);
		page.setTexture(new spine.GLTexture(gl, image));
	}

	const attachmentLoader = new spine.AtlasAttachmentLoader(atlas);
	const json = new spine.SkeletonJson(attachmentLoader);
	json.scale = config.scale;
	const skeletonData = json.readSkeletonData(config.jsonText);
	const skeleton = new spine.Skeleton(skeletonData);
	const stateData = new spine.AnimationStateData(skeletonData);
	const state = new spine.AnimationState(stateData);

	const id = nextId++;
	sessions.set(id, {
		spine,
		canvas,
		gl,
		renderer,
		skeleton,
		skeletonData,
		state,
		stateData,
		scale: config.scale,
	});

	const meta: SessionMeta = {
		animations: skeletonData.animations.map((a) => ({ name: a.name, duration: a.duration })),
		skins: skeletonData.skins.map((s) => s.name),
		slots: skeletonData.slots.map((sl) => sl.name),
		declared: {
			x: skeletonData.x,
			y: skeletonData.y,
			width: skeletonData.width,
			height: skeletonData.height,
		},
	};
	return { id, meta };
}

// both bundled cores (4.0.28 + 4.2.7) share the pre-physics api: no-arg world
// transform update and the classic setup-pose/skin method names.
function updateWorld(s: Session): void {
	s.skeleton.updateWorldTransform();
}

function applySkin(s: Session, skin: string | undefined): void {
	if (skin) {
		s.skeleton.setSkinByName(skin);
		s.skeleton.setSlotsToSetupPose();
	}
}

// frame the box, size the canvas, render every requested time, read pixels back.
async function renderAnimation(id: number, req: RenderRequest): Promise<RenderResult> {
	const s = sessions.get(id);
	if (!s) throw new Error(`unknown session ${id}`);

	const anim = s.skeletonData.findAnimation(req.animation);
	if (!anim) throw new Error(`animation not found: ${req.animation}`);

	applySkin(s, req.skin);

	// loop the track when the clip runs past one animation length (--loops, or an
	// explicit longer --duration) so extra frames replay instead of freezing.
	const loop = req.times === undefined && (req.loops > 1 || req.duration > anim.duration);

	// pose at t=0 so bounds/first frame are meaningful
	s.skeleton.setToSetupPose();
	s.state.setAnimation(0, req.animation, loop);
	s.state.update(0);
	s.state.apply(s.skeleton);
	updateWorld(s);

	const box = req.box ?? frameBox(s, req.fit);
	const size = outputSize(box, req.width, req.height);
	sizeCanvas(s, size.width, size.height);
	setCamera(s, box, size.width, size.height);

	const times = req.times ?? frameTimes(anim.duration, req.duration, req.fps, req.loops);

	const frames: string[] = [];
	let prev = 0;
	for (const t of times) {
		s.skeleton.setToSetupPose();
		applySkin(s, req.skin);
		s.state.update(t - prev);
		prev = t;
		s.state.apply(s.skeleton);
		updateWorld(s);
		isolate(s, req.slots);
		frames.push(renderFrame(s, size.width, size.height, req));
	}

	return { width: size.width, height: size.height, frames };
}

// detach every slot not in the piece so drawSkeleton skips them. attachments are
// reset from the setup pose each frame, so this reapplies per frame.
function isolate(s: Session, slots: string[] | undefined): void {
	if (!slots) return;
	const keep = new Set(slots);
	for (const slot of s.skeleton.slots) {
		if (!keep.has(slot.data.name)) slot.setAttachment(null);
	}
}

// walk the clip once, accumulating a per-frame-union framing box for the whole
// skeleton and for each piece. no rendering; used to pick aligned boxes.
async function measurePieces(id: number, req: MeasureRequest): Promise<MeasureResult> {
	const s = sessions.get(id);
	if (!s) throw new Error(`unknown session ${id}`);

	const anim = s.skeletonData.findAnimation(req.animation);
	if (!anim) throw new Error(`animation not found: ${req.animation}`);

	applySkin(s, req.skin);
	const loop = req.times === undefined && (req.loops > 1 || req.duration > anim.duration);
	const times = req.times ?? frameTimes(anim.duration, req.duration, req.fps, req.loops);

	// measure only the box node's --fit will read: bounds uses the whole-skeleton
	// union, piece/shared use the per-piece boxes. skip the rest per frame.
	const needSkeleton = req.fit === "bounds";
	const needPieces = req.fit === "piece" || req.fit === "shared";
	const pieceSets = req.pieces.map((names) => new Set(names));
	const perPiece: (Box | null)[] = req.pieces.map(() => null);
	let skeletonUnion: Box | null = null;

	s.skeleton.setToSetupPose();
	s.state.setAnimation(0, req.animation, loop);

	let prev = 0;
	for (const t of times) {
		s.skeleton.setToSetupPose();
		applySkin(s, req.skin);
		s.state.update(t - prev);
		prev = t;
		s.state.apply(s.skeleton);
		updateWorld(s);

		if (needSkeleton) skeletonUnion = unionBox(skeletonUnion, boundsOf(s));

		if (needPieces) {
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
	}

	const declared = declaredBox(s);
	let selectedUnion: Box | null = null;
	for (const b of perPiece) selectedUnion = unionBox(selectedUnion, b);

	return {
		perPiece: perPiece.map((b) => b ?? declared),
		selectedUnion: selectedUnion ?? declared,
		skeletonUnion: skeletonUnion ?? declared,
		declared,
	};
}

// current getBounds over whatever slots are attached; null if empty.
function boundsOf(s: Session): Box | null {
	const offset = new s.spine.Vector2();
	const size = new s.spine.Vector2();
	s.skeleton.getBounds(offset, size, []);
	if (size.x > 0 && size.y > 0) {
		return { x: offset.x, y: offset.y, width: size.x, height: size.y };
	}
	return null;
}

function unionBox(a: Box | null, b: Box | null): Box | null {
	if (!b) return a;
	if (!a) return b;
	const x0 = Math.min(a.x, b.x);
	const y0 = Math.min(a.y, b.y);
	const x1 = Math.max(a.x + a.width, b.x + b.width);
	const y1 = Math.max(a.y + a.height, b.y + b.height);
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// declared box stored unscaled; scale into the scaled-geometry space.
function declaredBox(s: Session): Box {
	const sd = s.skeletonData;
	return {
		x: sd.x * s.scale,
		y: sd.y * s.scale,
		width: sd.width * s.scale,
		height: sd.height * s.scale,
	};
}

function frameBox(s: Session, fit: RenderRequest["fit"]): Box {
	if (fit === "bounds") {
		const bounds = boundsOf(s);
		if (bounds) return bounds;
	}
	return declaredBox(s);
}

function outputSize(
	box: { width: number; height: number },
	width?: number,
	height?: number,
): { width: number; height: number } {
	const bw = Math.max(1, box.width);
	const bh = Math.max(1, box.height);
	let w: number;
	let h: number;
	if (width && height) {
		w = width;
		h = height;
	} else if (width) {
		w = width;
		h = Math.round((width * bh) / bw);
	} else if (height) {
		h = height;
		w = Math.round((height * bw) / bh);
	} else {
		w = Math.round(bw);
		h = Math.round(bh);
	}
	return { width: Math.max(1, w), height: Math.max(1, h) };
}

function sizeCanvas(s: Session, w: number, h: number): void {
	if (s.canvas.width !== w) s.canvas.width = w;
	if (s.canvas.height !== h) s.canvas.height = h;
	s.gl.viewport(0, 0, w, h);
}

// contain the box in the canvas, centered. equal aspect fills edge to edge.
function setCamera(
	s: Session,
	box: { x: number; y: number; width: number; height: number },
	w: number,
	h: number,
): void {
	const cam = s.renderer.camera;
	cam.setViewport(w, h);
	const zoom = Math.max(box.width / w, box.height / h);
	cam.zoom = zoom > 0 ? zoom : 1;
	cam.position.x = box.x + box.width / 2;
	cam.position.y = box.y + box.height / 2;
	cam.update();
}

function renderFrame(s: Session, w: number, h: number, req: RenderRequest): string {
	const gl = s.gl;
	gl.clearColor(req.background.r, req.background.g, req.background.b, req.background.a);
	gl.clear(gl.COLOR_BUFFER_BIT);

	s.renderer.begin();
	s.renderer.drawSkeleton(s.skeleton, req.premultipliedAlpha);
	s.renderer.end();

	const buf = new Uint8Array(w * h * 4);
	gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
	// the framebuffer holds premultiplied rgb; png/apng/gif want straight alpha,
	// so divide rgb back out or soft edges composite too dark.
	if (req.premultipliedAlpha) unpremultiply(buf);
	flipRows(buf, w, h);
	return toBase64(buf);
}

// convert premultiplied rgba to straight alpha in place. a=0/255 are no-ops.
function unpremultiply(buf: Uint8Array): void {
	for (let i = 0; i < buf.length; i += 4) {
		const a = buf[i + 3];
		if (a === 0 || a === 255) continue;
		buf[i] = Math.min(255, Math.round((buf[i] * 255) / a));
		buf[i + 1] = Math.min(255, Math.round((buf[i + 1] * 255) / a));
		buf[i + 2] = Math.min(255, Math.round((buf[i + 2] * 255) / a));
	}
}

// gl readback is bottom-up; flip to top-down in place.
function flipRows(buf: Uint8Array, w: number, h: number): void {
	const stride = w * 4;
	const tmp = new Uint8Array(stride);
	for (let y = 0; y < Math.floor(h / 2); y++) {
		const top = y * stride;
		const bot = (h - 1 - y) * stride;
		tmp.set(buf.subarray(top, top + stride));
		buf.copyWithin(top, bot, bot + stride);
		buf.set(tmp, bot);
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

function toBase64(buf: Uint8Array): string {
	let s = "";
	const chunk = 0x8000;
	for (let i = 0; i < buf.length; i += chunk) {
		s += String.fromCharCode(...buf.subarray(i, i + chunk));
	}
	return btoa(s);
}

function disposeSession(id: number): void {
	const s = sessions.get(id);
	if (!s) return;
	s.renderer.dispose();
	sessions.delete(id);
}

declare global {
	interface Window {
		SpineHarness: {
			createSession(config: SessionConfig): Promise<{ id: number; meta: SessionMeta }>;
			renderAnimation(id: number, req: RenderRequest): Promise<RenderResult>;
			measurePieces(id: number, req: MeasureRequest): Promise<MeasureResult>;
			disposeSession(id: number): void;
		};
	}
}

window.SpineHarness = { createSession, renderAnimation, measurePieces, disposeSession };
