import type { Box, RenderRequest } from "#/render/harness/contract.ts";
import type { Session } from "#/render/harness/session.ts";

export function sizeCanvas(s: Session, w: number, h: number): void {
	if (s.canvas.width !== w) s.canvas.width = w;
	if (s.canvas.height !== h) s.canvas.height = h;
	s.gl.viewport(0, 0, w, h);
}

export function containBoxInView(s: Session, box: Box, w: number, h: number): void {
	const cam = s.renderer.camera;
	cam.setViewport(w, h);
	const zoom = Math.max(box.width / w, box.height / h);
	cam.zoom = zoom > 0 ? zoom : 1;
	cam.position.x = box.x + box.width / 2;
	cam.position.y = box.y + box.height / 2;
	cam.update();
}

export function renderFrame(s: Session, w: number, h: number, req: RenderRequest): string {
	const gl = s.gl;
	gl.clearColor(req.background.r, req.background.g, req.background.b, req.background.a);
	gl.clear(gl.COLOR_BUFFER_BIT);

	s.renderer.begin();
	s.renderer.drawSkeleton(s.skeleton, s.atlasIsPremultiplied);
	s.renderer.end();

	const buf = new Uint8Array(w * h * 4);
	gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
	if (s.atlasIsPremultiplied) toStraightAlpha(buf);
	flipBottomUpRowsToTopDown(buf, w, h);
	return toBase64(buf);
}

function toStraightAlpha(buf: Uint8Array): void {
	for (let i = 0; i < buf.length; i += 4) {
		const a = buf[i + 3];
		if (a === 0 || a === 255) continue;
		buf[i] = Math.min(255, Math.round((buf[i] * 255) / a));
		buf[i + 1] = Math.min(255, Math.round((buf[i + 1] * 255) / a));
		buf[i + 2] = Math.min(255, Math.round((buf[i + 2] * 255) / a));
	}
}

function flipBottomUpRowsToTopDown(buf: Uint8Array, w: number, h: number): void {
	const stride = w * 4;
	const tmp = new Uint8Array(stride);
	for (let y = 0; y < Math.floor(h / 2); y++) {
		const top = y * stride;
		const bot = (h - 1 - y) * stride;
		tmp.set(buf.subarray(top, top + stride));
		buf.copyWithin(top, bot, bot + stride);
		buf.set(tmp, bot);
	}
}

function toBase64(buf: Uint8Array): string {
	let s = "";
	const chunk = 0x8000;
	for (let i = 0; i < buf.length; i += chunk) {
		s += String.fromCharCode(...buf.subarray(i, i + chunk));
	}
	return btoa(s);
}
