import type { Format } from "#/render/formats.ts";
import type {
	Box,
	ClipTiming,
	Fit,
	MeasureRequest,
	MeasureResult,
	RenderRequest,
	Rgba,
} from "#/render/harness/contract.ts";

import { formatSpec } from "#/render/formats.ts";

export interface RunParams {
	scale: number;
	fps: number;
	loops: number;
	frame: number;
	duration?: number;
	fit: Fit;
	width?: number;
	height?: number;
	skin?: string;
	background: Rgba;
	format: Format;
	lossyQuality?: number;
}

export function pickBox(fit: Fit, boxes: MeasureResult, i: number): Box {
	if (fit === "piece") return boxes.perPiece[i];
	if (fit === "shared") return boxes.selectedUnion;
	if (fit === "bounds") return boxes.skeletonUnion;
	return boxes.declared;
}

function clipTiming(animation: string, params: RunParams): ClipTiming {
	const isSingleStill = formatSpec(params.format).still;
	return {
		animation,
		skin: params.skin,
		fps: params.fps,
		duration: params.duration ?? 0,
		loops: params.loops,
		fit: params.fit,
		times: isSingleStill ? [params.frame] : undefined,
	};
}

export function buildRequest(animation: string, params: RunParams): RenderRequest {
	return {
		...clipTiming(animation, params),
		width: params.width,
		height: params.height,
		background: params.background,
	};
}

export function buildMeasureReq(
	animation: string,
	pieces: string[][],
	params: RunParams,
): MeasureRequest {
	return { ...clipTiming(animation, params), pieces };
}
