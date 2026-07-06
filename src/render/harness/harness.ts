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

interface SessionMeta {
	animations: AnimationMeta[];
	skins: string[];
	declared: { x: number; y: number; width: number; height: number };
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
	fit: "declared" | "bounds";
	width?: number;
	height?: number;
	// clear color, 0..1
	background: { r: number; g: number; b: number; a: number };
	premultipliedAlpha: boolean;
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

	// pose at t=0 so bounds/first frame are meaningful
	s.skeleton.setToSetupPose();
	s.state.setAnimation(0, req.animation, false);
	s.state.update(0);
	s.state.apply(s.skeleton);
	updateWorld(s);

	const box = frameBox(s, req.fit);
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
		frames.push(renderFrame(s, size.width, size.height, req));
	}

	return { width: size.width, height: size.height, frames };
}

function frameBox(
	s: Session,
	fit: "declared" | "bounds",
): { x: number; y: number; width: number; height: number } {
	if (fit === "bounds") {
		const offset = new s.spine.Vector2();
		const bsize = new s.spine.Vector2();
		s.skeleton.getBounds(offset, bsize, []);
		if (bsize.x > 0 && bsize.y > 0) {
			return { x: offset.x, y: offset.y, width: bsize.x, height: bsize.y };
		}
	}
	// declared box is stored unscaled; scale it into the scaled-geometry space
	const sd = s.skeletonData;
	return {
		x: sd.x * s.scale,
		y: sd.y * s.scale,
		width: sd.width * s.scale,
		height: sd.height * s.scale,
	};
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
	flipRows(buf, w, h);
	return toBase64(buf);
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
			disposeSession(id: number): void;
		};
	}
}

window.SpineHarness = { createSession, renderAnimation, disposeSession };
