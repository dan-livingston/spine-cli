import type { SpineMajor } from "#/types.ts";

export type Fit = "declared" | "bounds" | "piece" | "shared";

export interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SessionConfig {
	major: SpineMajor;
	jsonText: string;
	atlasText: string;
	pages: { name: string; dataUrl: string }[];
	scale: number;
}

export interface AnimationMeta {
	name: string;
	duration: number;
}

export interface SessionMeta {
	animations: AnimationMeta[];
	skins: string[];
	slots: string[];
	declared: Box;
}

export interface ClipTiming {
	animation: string;
	skin?: string;
	fps: number;
	duration: number;
	loops: number;
	times?: number[];
	fit: Fit;
}

export interface RenderRequest extends ClipTiming {
	slots?: string[];
	box?: Box;
	width?: number;
	height?: number;
	background: Rgba;
}

export interface MeasureRequest extends ClipTiming {
	pieces: string[][];
}

export interface MeasureResult {
	perPiece: Box[];
	selectedUnion: Box;
	skeletonUnion: Box;
	declared: Box;
}

export interface RenderResult {
	width: number;
	height: number;
	frames: string[];
}

export interface HarnessApi {
	createSession(config: SessionConfig): Promise<{ id: number; meta: SessionMeta }>;
	renderAnimation(id: number, req: RenderRequest): Promise<RenderResult>;
	measurePieces(id: number, req: MeasureRequest): Promise<MeasureResult>;
	disposeSession(id: number): void;
}
