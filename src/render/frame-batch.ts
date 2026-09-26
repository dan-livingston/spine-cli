const RGBA_BYTES = 4;

const BATCH_BYTES = 64 * 1024 * 1024;

export function framesPerBatch(width: number, height: number): number {
	return Math.max(1, Math.floor(BATCH_BYTES / (width * height * RGBA_BYTES)));
}
