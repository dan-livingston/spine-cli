import * as spine40 from "spine-webgl-40";
import * as spine42 from "spine-webgl-42";

import type { SessionConfig, SessionMeta } from "#/render/harness/contract.ts";
import type { SpineMajor } from "#/types.ts";

export type Spine = typeof spine42;

export interface Session {
	spine: Spine;
	canvas: HTMLCanvasElement;
	gl: WebGL2RenderingContext | WebGLRenderingContext;
	renderer: spine42.SceneRenderer;
	skeleton: spine42.Skeleton;
	skeletonData: spine42.SkeletonData;
	state: spine42.AnimationState;
	stateData: spine42.AnimationStateData;
	scale: number;
	atlasIsPremultiplied: boolean;
}

const PROVISIONAL_CANVAS_SIZE = 16;

const sessions = new Map<number, Session>();
let nextId = 1;

function pickSpine(major: SpineMajor): Spine {
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

export async function createSession(
	config: SessionConfig,
): Promise<{ id: number; meta: SessionMeta }> {
	const spine = pickSpine(config.major);

	const canvas = document.createElement("canvas");
	canvas.width = PROVISIONAL_CANVAS_SIZE;
	canvas.height = PROVISIONAL_CANVAS_SIZE;
	const gl = (canvas.getContext("webgl2") ||
		canvas.getContext("webgl")) as WebGL2RenderingContext | null;
	if (!gl) throw new Error("could not get a webgl2/webgl context");

	const renderer = new spine.SceneRenderer(canvas, gl);
	const atlas = await loadAtlas(spine, gl, config);

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
		atlasIsPremultiplied: everyPageIsPremultiplied(atlas),
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

async function loadAtlas(
	spine: Spine,
	gl: WebGLRenderingContext,
	config: SessionConfig,
): Promise<spine42.TextureAtlas> {
	const atlas = new spine.TextureAtlas(config.atlasText);
	for (const page of atlas.pages) {
		const match = config.pages.find((p) => p.name === page.name);
		if (!match) throw new Error(`atlas page image not provided: ${page.name}`);
		const image = await loadImage(match.dataUrl);
		page.setTexture(new spine.GLTexture(gl, image));
	}
	return atlas;
}

function everyPageIsPremultiplied(atlas: spine42.TextureAtlas): boolean {
	return atlas.pages.length > 0 && atlas.pages.every((p) => p.pma);
}

export function sessionFor(id: number): Session {
	const s = sessions.get(id);
	if (!s) throw new Error(`unknown session ${id}`);
	return s;
}

export function disposeSession(id: number): void {
	const s = sessions.get(id);
	if (!s) return;
	s.renderer.dispose();
	sessions.delete(id);
}
