import type { Frame } from "#/encode/png.ts";
import type { Rgba } from "#/render/harness/contract.ts";

export interface SheetGrid {
	rows?: number;
	columns?: number;
}

export interface SheetParams extends SheetGrid {
	padding: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SheetCells {
	frameCount: number;
	frameWidth: number;
	frameHeight: number;
	columns: number;
	padding: number;
}

export interface SheetLayout {
	width: number;
	height: number;
	frameWidth: number;
	frameHeight: number;
	columns: number;
	rows: number;
	padding: number;
	frames: Rect[];
}

const RGBA_BYTES = 4;

export function sheetColumns(frameCount: number, grid: SheetGrid): number {
	if (grid.columns !== undefined) return Math.min(grid.columns, frameCount);
	if (grid.rows !== undefined) return Math.ceil(frameCount / Math.min(grid.rows, frameCount));
	return frameCount;
}

export function layoutSheet(cells: SheetCells): SheetLayout {
	const { frameCount, frameWidth, frameHeight, columns, padding } = cells;
	const rows = Math.ceil(frameCount / columns);
	const frames = Array.from({ length: frameCount }, (_, i) => ({
		x: (i % columns) * (frameWidth + padding),
		y: Math.floor(i / columns) * (frameHeight + padding),
		w: frameWidth,
		h: frameHeight,
	}));
	return {
		width: columns * frameWidth + (columns - 1) * padding,
		height: rows * frameHeight + (rows - 1) * padding,
		frameWidth,
		frameHeight,
		columns,
		rows,
		padding,
		frames,
	};
}

export interface Sheet {
	layout: SheetLayout;
	image: Frame;
}

export function arrangeSheet(frames: Frame[], params: SheetParams, background: Rgba): Sheet {
	const [{ width, height }] = frames;
	const layout = layoutSheet({
		frameCount: frames.length,
		frameWidth: width,
		frameHeight: height,
		columns: sheetColumns(frames.length, params),
		padding: params.padding,
	});
	return { layout, image: composeSheet(frames, layout, background) };
}

export function composeSheet(frames: Frame[], layout: SheetLayout, background: Rgba): Frame {
	const { width, height } = layout;
	const data = filled(width * height, background);
	const stride = width * RGBA_BYTES;
	layout.frames.forEach((rect, i) => {
		const source = frames[i].data;
		const rowBytes = rect.w * RGBA_BYTES;
		for (let y = 0; y < rect.h; y++) {
			const from = y * rowBytes;
			data.set(
				source.subarray(from, from + rowBytes),
				(rect.y + y) * stride + rect.x * RGBA_BYTES,
			);
		}
	});
	return { width, height, data };
}

function filled(pixels: number, color: Rgba): Uint8Array {
	const data = new Uint8Array(pixels * RGBA_BYTES);
	const bytes = [color.r, color.g, color.b, color.a].map((c) => Math.round(c * 255));
	if (bytes.every((b) => b === 0)) return data;
	for (let i = 0; i < data.length; i += RGBA_BYTES) data.set(bytes, i);
	return data;
}
