import { dirname, relative } from "node:path";

import type { Format } from "#/render/formats.ts";
import type { Rect, SheetLayout } from "#/render/sheet.ts";

export interface SheetSidecar {
	image: string;
	format: Format;
	frameWidth: number;
	frameHeight: number;
	columns: number;
	rows: number;
	frameCount: number;
	fps: number;
	padding: number;
	frames: Rect[];
}

export interface SidecarSubject {
	image: string;
	sidecar: string;
	format: Format;
	fps: number;
}

export function sheetSidecar(layout: SheetLayout, subject: SidecarSubject): SheetSidecar {
	return {
		image: relative(dirname(subject.sidecar), subject.image),
		format: subject.format,
		frameWidth: layout.frameWidth,
		frameHeight: layout.frameHeight,
		columns: layout.columns,
		rows: layout.rows,
		frameCount: layout.frames.length,
		fps: subject.fps,
		padding: layout.padding,
		frames: layout.frames,
	};
}

export function encodeSidecar(sidecar: SheetSidecar): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(sidecar, null, "\t")}\n`);
}
