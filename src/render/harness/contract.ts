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
	groupSlots?: string[];
	width?: number;
	height?: number;
	background: Rgba;
}

export interface ClipInfo {
	width: number;
	height: number;
	frameCount: number;
}

export interface HarnessApi {
	createSession(config: SessionConfig): Promise<{ id: number }>;
	startClip(id: number, req: RenderRequest): Promise<ClipInfo>;
	nextFrames(id: number, maxFrames: number): Promise<string[]>;
	disposeSession(id: number): void;
}
