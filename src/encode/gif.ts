import gifenc from "gifenc";

import type { Frame } from "./png.ts";

// gifenc types declare its exports as methods, so destructuring trips the
// unbound-method lint; call through the namespace instead.
// animated gif from rgba frames. gif has 1-bit alpha, so edges against a
// transparent background are hard; a solid --background looks cleaner.
export function encodeGif(frames: Frame[], fps: number): Uint8Array {
	if (frames.length === 0) throw new Error("no frames to encode");
	const { width, height } = frames[0];
	const delay = Math.max(10, Math.round(1000 / fps));
	const enc = gifenc.GIFEncoder();

	for (const frame of frames) {
		const palette = gifenc.quantize(frame.data, 256, {
			format: "rgba4444",
			oneBitAlpha: true,
		});
		const index = gifenc.applyPalette(frame.data, palette, "rgba4444");
		// gifenc puts the fully-transparent color, if any, at the palette end.
		const transparentIndex = findTransparent(palette);
		enc.writeFrame(index, width, height, {
			palette,
			delay,
			transparent: transparentIndex >= 0,
			transparentIndex: transparentIndex >= 0 ? transparentIndex : undefined,
			dispose: transparentIndex >= 0 ? 2 : undefined,
		});
	}

	enc.finish();
	return enc.bytes();
}

function findTransparent(palette: number[][]): number {
	for (let i = 0; i < palette.length; i++) {
		const c = palette[i];
		if (c.length >= 4 && c[3] === 0) return i;
	}
	return -1;
}
