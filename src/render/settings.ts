import type { RenderOptions } from "#/render/options.ts";
import type { RunParams } from "#/render/requests.ts";

import {
	parseBackground,
	parseFit,
	parseFormat,
	parseNumber,
	parseOptionalNumber,
	parseWebpLossyQuality,
} from "#/render/options.ts";
import { assertDistinctPieceNames } from "#/render/pieces.ts";

export type RenderSettings = Omit<RunParams, "ffmpeg" | "img2webp"> & {
	concurrency: number;
	pieceSpecs: string[];
	dryRun: boolean;
};

export function parseRenderSettings(options: RenderOptions): RenderSettings {
	const format = parseFormat(options.format);
	const pieceSpecs = options.piece ?? [];
	const settings: RenderSettings = {
		format,
		fps: parseNumber(options.fps, "fps", 30, { min: 1 }),
		scale: parseNumber(options.scale, "scale", 1, { min: 0, exclusiveMin: true }),
		loops: parseNumber(options.loops, "loops", 1, { min: 1, integer: true }),
		frame: parseNumber(options.frame, "frame", 0, { min: 0 }),
		concurrency: parseNumber(options.concurrency, "concurrency", 1, { min: 1, integer: true }),
		width: parseOptionalNumber(options.width, "width", { min: 1, integer: true }),
		height: parseOptionalNumber(options.height, "height", { min: 1, integer: true }),
		duration: parseOptionalNumber(options.duration, "duration", { min: 0, exclusiveMin: true }),
		fit: parseFit(options.fit, pieceSpecs.length > 0),
		skin: options.skin,
		background: parseBackground(options.background, format),
		lossyQuality: parseWebpLossyQuality(options.quality, format),
		pieceSpecs,
		dryRun: options.dryRun ?? false,
	};
	assertDistinctPieceNames(pieceSpecs);
	return settings;
}
