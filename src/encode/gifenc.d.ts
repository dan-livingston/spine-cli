// gifenc ships no types; declare the minimal surface we use. it is a cjs module
// whose named functions live on the default export.
declare module "gifenc" {
	export type Palette = number[][];

	export interface QuantizeOptions {
		format?: "rgb565" | "rgb444" | "rgba4444";
		oneBitAlpha?: boolean | number;
		clearAlpha?: boolean;
		clearAlphaThreshold?: number;
		clearAlphaColor?: number;
	}

	export interface WriteFrameOptions {
		palette?: Palette;
		delay?: number;
		transparent?: boolean;
		transparentIndex?: number;
		dispose?: number;
		repeat?: number;
	}

	export interface Encoder {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			options?: WriteFrameOptions,
		): void;
		finish(): void;
		bytes(): Uint8Array;
	}

	interface Gifenc {
		GIFEncoder(options?: { auto?: boolean }): Encoder;
		quantize(rgba: Uint8Array, maxColors: number, options?: QuantizeOptions): Palette;
		applyPalette(rgba: Uint8Array, palette: Palette, format?: string): Uint8Array;
	}

	const gifenc: Gifenc;
	export default gifenc;
}
