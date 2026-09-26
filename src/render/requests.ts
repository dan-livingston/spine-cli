import type { Format } from "#/render/formats.ts";
import type { Fit, RenderRequest, Rgba } from "#/render/harness/contract.ts";
import type { SheetParams } from "#/render/sheet.ts";

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
	sheet?: SheetParams;
}

export interface PieceFraming {
	slots?: string[];
	groupSlots?: string[];
}

export function buildRequest(
	animation: string,
	params: RunParams,
	framing: PieceFraming = {},
): RenderRequest {
	const isSingleStill = formatSpec(params.format).still && !params.sheet;
	return {
		animation,
		skin: params.skin,
		fps: params.fps,
		duration: params.duration ?? 0,
		loops: params.loops,
		fit: params.fit,
		times: isSingleStill ? [params.frame] : undefined,
		...framing,
		width: params.width,
		height: params.height,
		background: params.background,
	};
}
