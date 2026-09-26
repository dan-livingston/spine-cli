import type { Frame } from "#/encode/png.ts";
import type { Io } from "#/ports/env.ts";
import type { Rgba } from "#/render/harness/contract.ts";

import { encodeApng } from "#/encode/apng.ts";
import { encodeGif } from "#/encode/gif.ts";
import { encodePng, writePngSequence } from "#/encode/png.ts";
import { encodeVideo } from "#/encode/video.ts";
import { encodeWebp, encodeWebpStill } from "#/encode/webp.ts";

export interface EncodeSettings {
	format: Format;
	fps: number;
	background: Rgba;
	lossyQuality?: number;
}

export interface Tool {
	command: string;
	installs: string;
}

export interface Encode {
	io: Io;
	path: string;
	frames: Frame[];
	settings: EncodeSettings;
}

export interface SheetSpec {
	tool?: Tool;
	maxSide: number;
	oversize: "fails" | "warns";
	encode(encode: Encode): Promise<void>;
}

interface FormatSpec {
	extension?: string;
	alpha: true | { instead: string };
	still: boolean;
	lossyQuality: boolean;
	tool?: Tool;
	sheet?: SheetSpec;
	encode(encode: Encode): Promise<void>;
}

const FFMPEG: Tool = { command: "ffmpeg", installs: "ffmpeg" };

const IMG2WEBP: Tool = { command: "img2webp", installs: "libwebp" };

const CWEBP: Tool = { command: "cwebp", installs: "libwebp" };

const animated = { alpha: true, still: false, lossyQuality: false } as const;

async function writeFile(io: Io, path: string, bytes: Uint8Array): Promise<void> {
	await io.files.write(path, bytes);
}

function writeFirstPng({ io, path, frames }: Encode): Promise<void> {
	return writeFile(io, path, encodePng(frames[0]));
}

const FORMATS = {
	pngseq: {
		...animated,
		encode: ({ io, path, frames }) => writePngSequence(io.files, path, frames),
	},
	png: {
		...animated,
		extension: ".png",
		still: true,
		sheet: { maxSide: 8192, oversize: "warns", encode: writeFirstPng },
		encode: writeFirstPng,
	},
	gif: {
		...animated,
		extension: ".gif",
		encode: ({ io, path, frames, settings }) =>
			writeFile(io, path, encodeGif(frames, settings.fps)),
	},
	apng: {
		...animated,
		extension: ".apng",
		encode: ({ io, path, frames, settings }) =>
			writeFile(io, path, encodeApng(frames, settings.fps)),
	},
	mp4: {
		...animated,
		extension: ".mp4",
		alpha: { instead: "webm" },
		tool: FFMPEG,
		encode: ({ io, path, frames, settings }) =>
			encodeVideo(io.processes, FFMPEG.command, path, frames, { ...settings, format: "mp4" }),
	},
	webm: {
		...animated,
		extension: ".webm",
		tool: FFMPEG,
		encode: ({ io, path, frames, settings }) =>
			encodeVideo(io.processes, FFMPEG.command, path, frames, {
				...settings,
				format: "webm",
			}),
	},
	webp: {
		...animated,
		extension: ".webp",
		lossyQuality: true,
		tool: IMG2WEBP,
		sheet: {
			tool: CWEBP,
			maxSide: 16383,
			oversize: "fails",
			encode: ({ io, path, frames, settings }) =>
				encodeWebpStill(io, CWEBP.command, path, frames[0], settings.lossyQuality),
		},
		encode: ({ io, path, frames, settings }) =>
			encodeWebp(io, IMG2WEBP.command, path, frames, settings.fps, settings.lossyQuality),
	},
} satisfies Record<string, FormatSpec>;

export type Format = keyof typeof FORMATS;

export const FORMAT_NAMES = Object.keys(FORMATS) as Format[];

export function isFormat(value: string): value is Format {
	return Object.hasOwn(FORMATS, value);
}

export function formatSpec(format: Format): FormatSpec {
	return FORMATS[format];
}

export function formatsWhere(test: (spec: FormatSpec) => boolean): Format[] {
	return FORMAT_NAMES.filter((name) => test(FORMATS[name]));
}

export function listOf(names: string[], conjunction: string): string {
	return names.length < 2
		? names.join("")
		: `${names.slice(0, -1).join(", ")} ${conjunction} ${names.at(-1)}`;
}
