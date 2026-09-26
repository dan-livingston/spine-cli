import type { Box } from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";

export function boundsOf(s: Session): Box | null {
	const offset = new s.spine.Vector2();
	const size = new s.spine.Vector2();
	s.skeleton.getBounds(offset, size, []);
	if (size.x > 0 && size.y > 0) {
		return { x: offset.x, y: offset.y, width: size.x, height: size.y };
	}
	return null;
}

export function unionBox(a: Box | null, b: Box | null): Box | null {
	if (!b) return a;
	if (!a) return b;
	const x0 = Math.min(a.x, b.x);
	const y0 = Math.min(a.y, b.y);
	const x1 = Math.max(a.x + a.width, b.x + b.width);
	const y1 = Math.max(a.y + a.height, b.y + b.height);
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function declaredBoxScaled(s: Session): Box {
	const sd = s.skeletonData;
	return {
		x: sd.x * s.scale,
		y: sd.y * s.scale,
		width: sd.width * s.scale,
		height: sd.height * s.scale,
	};
}

export function outputSize(
	box: { width: number; height: number },
	width?: number,
	height?: number,
): { width: number; height: number } {
	const bw = Math.max(1, box.width);
	const bh = Math.max(1, box.height);
	let w: number;
	let h: number;
	if (width && height) {
		w = width;
		h = height;
	} else if (width) {
		w = width;
		h = Math.round((width * bh) / bw);
	} else if (height) {
		h = height;
		w = Math.round((height * bw) / bh);
	} else {
		w = Math.round(bw);
		h = Math.round(bh);
	}
	return { width: Math.max(1, w), height: Math.max(1, h) };
}
