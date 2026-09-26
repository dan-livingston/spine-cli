import type { Encode, SheetSpec } from "#/render/formats.ts";
import type { SheetLayout, SheetParams } from "#/render/sheet.ts";

import { encodeSidecar, sheetSidecar } from "#/render/sheet-sidecar.ts";
import { composeSheet, layoutClipSheet } from "#/render/sheet.ts";

export class SheetTooLargeError extends Error {
	readonly size: string;
	readonly format: string;
	readonly maxSide: number;

	constructor(layout: SheetLayout, format: string, maxSide: number) {
		const size = `${layout.width}x${layout.height} px`;
		super(tooLarge("sheet", size, format, maxSide));
		this.size = size;
		this.format = format;
		this.maxSide = maxSide;
	}

	describe(subject: string): string {
		return tooLarge(subject, this.size, this.format, this.maxSide);
	}
}

function tooLarge(subject: string, size: string, format: string, maxSide: number): string {
	return `${subject} is ${size}, over the ${format} limit of ${maxSide} px a side; use a smaller --scale, a lower --fps, or --rows/--columns`;
}

export async function writeSheet(
	encode: Encode,
	spec: SheetSpec,
	params: SheetParams,
	sidecar: string | undefined,
): Promise<string[]> {
	const { io, path, frames, settings } = encode;
	const layout = layoutClipSheet(frames, params);
	const oversize = Math.max(layout.width, layout.height) > spec.maxSide;
	if (oversize && spec.oversize === "fails") {
		throw new SheetTooLargeError(layout, settings.format, spec.maxSide);
	}
	const image = composeSheet(frames, layout, settings.background);
	await spec.encode({ ...encode, frames: [image] });
	if (sidecar) {
		const subject = { ...settings, image: path, sidecar };
		await io.files.write(sidecar, encodeSidecar(sheetSidecar(layout, subject)));
	}
	if (!oversize) return [];
	return [
		`${path} is ${layout.width}x${layout.height} px; browsers and GPUs may refuse images over ${spec.maxSide} px a side`,
	];
}
