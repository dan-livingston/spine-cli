import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Frame } from "../encode/png.ts";
import type { Format, OutputContext } from "../render/output-path.ts";
import type { Clip, RenderRequest, SessionMeta } from "../render/renderer.ts";
import type { ResolvedInput } from "../types.ts";

import { encodeApng } from "../encode/apng.ts";
import { encodeGif } from "../encode/gif.ts";
import { encodePng, writePngSequence } from "../encode/png.ts";
import { encodeVideo, findFfmpeg } from "../encode/video.ts";
import { resolveInputs } from "../input/resolve.ts";
import { isFormat, planOutput } from "../render/output-path.ts";
import { RenderPool } from "../render/renderer.ts";

export interface RenderOptions {
	atlas?: string;
	animation?: string;
	format?: string;
	out?: string;
	outDir?: string;
	fps?: string;
	scale?: string;
	width?: string;
	height?: string;
	fit?: string;
	skin?: string;
	duration?: string;
	loops?: string;
	frame?: string;
	background?: string;
	concurrency?: string;
	dryRun?: boolean;
}

interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

// a single unit of work: one animation of one skeleton to one output target.
interface Job {
	input: ResolvedInput;
	animation: string;
	includeAnimation: boolean;
	target: { path: string; isDir: boolean };
}

export async function renderCommand(target: string, options: RenderOptions): Promise<void> {
	const format = parseFormat(options.format);
	const fps = parseNumber(options.fps, "fps", 30, { min: 1 });
	const scale = parseNumber(options.scale, "scale", 1, { min: 0, exclusiveMin: true });
	const loops = Math.round(parseNumber(options.loops, "loops", 1, { min: 1 }));
	const frame = parseNumber(options.frame, "frame", 0, { min: 0 });
	const concurrency = Math.round(parseNumber(options.concurrency, "concurrency", 1, { min: 1 }));
	const width = options.width
		? Math.round(parseNumber(options.width, "width", 0, { min: 1 }))
		: undefined;
	const height = options.height
		? Math.round(parseNumber(options.height, "height", 0, { min: 1 }))
		: undefined;
	const duration = options.duration
		? parseNumber(options.duration, "duration", 0, { min: 0, exclusiveMin: true })
		: undefined;
	const fit = parseFit(options.fit);
	const background = parseBackground(options.background, format);

	const inputs = await resolveInputs(target, options.atlas, (path, reason) => {
		console.warn(`skip ${path}: ${reason}`);
	});
	const batch = inputs.length > 1;

	// plan every job up front so --dry-run and naming share one code path.
	const jobs: Job[] = [];
	for (const input of inputs) {
		const animations = selectAnimations(input, options.animation);
		const includeAnimation = batch || animations.length > 1;
		for (const animation of animations) {
			const ctx: OutputContext = {
				jsonPath: input.jsonPath,
				skeletonName: input.skeletonName,
				animation,
				includeAnimation,
				format,
				out: options.out,
				outDir: options.outDir,
			};
			jobs.push({ input, animation, includeAnimation, target: planOutput(ctx) });
		}
	}

	if (options.out && jobs.length > 1) {
		throw new Error(
			`--out writes a single output but ${jobs.length} are planned; use --out-dir`,
		);
	}

	if (options.dryRun) {
		for (const job of jobs) {
			console.log(`${job.target.path}${job.target.isDir ? "/ (png sequence)" : ""}`);
		}
		return;
	}

	// video needs a real ffmpeg; fail early with a clear message before launching.
	let ffmpeg: string | null = null;
	if (format === "mp4" || format === "webm") {
		ffmpeg = await findFfmpeg();
		if (!ffmpeg) {
			throw new Error(
				`ffmpeg not found on PATH; install ffmpeg to render ${format}. pngseq, png, gif and apng work without it`,
			);
		}
	}

	const pool = await RenderPool.launch();
	try {
		await runJobs(pool, groupByInput(jobs), Math.min(concurrency, inputs.length), {
			scale,
			fps,
			loops,
			frame,
			duration,
			fit,
			width,
			height,
			skin: options.skin,
			background,
			format,
			ffmpeg,
		});
	} finally {
		await pool.close();
	}
}

interface RunParams {
	scale: number;
	fps: number;
	loops: number;
	frame: number;
	duration?: number;
	fit: "declared" | "bounds";
	width?: number;
	height?: number;
	skin?: string;
	background: Rgba;
	format: Format;
	ffmpeg: string | null;
}

// group jobs by their skeleton so a worker builds each skeleton once.
function groupByInput(jobs: Job[]): Job[][] {
	const byPath = new Map<string, Job[]>();
	for (const job of jobs) {
		const key = job.input.jsonPath;
		const list = byPath.get(key);
		if (list) list.push(job);
		else byPath.set(key, [job]);
	}
	return [...byPath.values()];
}

// a small worker pool: each worker owns a page and pulls skeleton groups.
async function runJobs(
	pool: RenderPool,
	groups: Job[][],
	workers: number,
	params: RunParams,
): Promise<void> {
	let next = 0;
	const take = (): Job[] | undefined => (next < groups.length ? groups[next++] : undefined);

	const run = async (): Promise<void> => {
		const worker = await pool.worker();
		for (let group = take(); group; group = take()) {
			await renderGroup(worker, group, params);
		}
	};

	await Promise.all(Array.from({ length: Math.max(1, workers) }, run));
}

async function renderGroup(
	worker: Awaited<ReturnType<RenderPool["worker"]>>,
	group: Job[],
	params: RunParams,
): Promise<void> {
	const input = group[0].input;
	const { id, meta } = await worker.createSession(input, params.scale);
	try {
		for (const job of group) {
			const req = buildRequest(job.animation, meta, params);
			const clip = await worker.render(id, req);
			await writeClip(job, clip, params);
			console.log(
				`wrote ${job.target.path}${job.target.isDir ? `/ (${clip.frames.length} frames)` : ""}`,
			);
		}
	} finally {
		await worker.dispose(id);
	}
}

function buildRequest(animation: string, meta: SessionMeta, params: RunParams): RenderRequest {
	const base: RenderRequest = {
		animation,
		skin: params.skin,
		fps: params.fps,
		duration: params.duration ?? 0,
		loops: params.loops,
		fit: params.fit,
		width: params.width,
		height: params.height,
		background: params.background,
		premultipliedAlpha: true,
	};
	// a single still: one exact time, ignore duration/loops
	if (params.format === "png") {
		base.times = [params.frame];
	}
	// silence unused meta until we need per-animation duration reporting
	void meta;
	return base;
}

async function writeClip(job: Job, clip: Clip, params: RunParams): Promise<void> {
	const frames = toFrames(clip);
	if (params.format === "pngseq") {
		await writePngSequence(job.target.path, frames);
		return;
	}

	await mkdir(dirname(job.target.path), { recursive: true });
	if (params.format === "png") {
		await writeFile(job.target.path, encodePng(frames[0]));
	} else if (params.format === "apng") {
		await writeFile(job.target.path, encodeApng(frames, params.fps));
	} else if (params.format === "gif") {
		await writeFile(job.target.path, encodeGif(frames, params.fps));
	} else if (params.format === "mp4" || params.format === "webm") {
		if (!params.ffmpeg) throw new Error("ffmpeg unavailable");
		await encodeVideo(params.ffmpeg, job.target.path, frames, params.fps, params.format);
	}
}

function toFrames(clip: Clip): Frame[] {
	return clip.frames.map((data) => ({ width: clip.width, height: clip.height, data }));
}

// animation names live in the json; read them without a browser roundtrip so
// selection and --dry-run work identically.
function animationNames(input: ResolvedInput): string[] {
	const data = JSON.parse(input.jsonText) as { animations?: Record<string, unknown> };
	return Object.keys(data.animations ?? {});
}

function selectAnimations(input: ResolvedInput, requested: string | undefined): string[] {
	const names = animationNames(input);
	if (names.length === 0) throw new Error(`${input.skeletonName}: skeleton has no animations`);
	if (requested === "all") return names;
	if (requested) {
		if (!names.includes(requested)) {
			throw new Error(
				`${input.skeletonName}: no animation "${requested}"; have: ${names.join(", ")}`,
			);
		}
		return [requested];
	}
	if (names.length === 1) return names;
	throw new Error(
		`${input.skeletonName}: multiple animations, pass --animation <name> or all; have: ${names.join(", ")}`,
	);
}

function parseFormat(value: string | undefined): Format {
	if (value === undefined) return "pngseq";
	if (!isFormat(value)) {
		throw new Error(`unknown format "${value}"; use pngseq, png, gif, apng, mp4 or webm`);
	}
	return value;
}

function parseFit(value: string | undefined): "declared" | "bounds" {
	if (value === undefined) return "declared";
	if (value !== "declared" && value !== "bounds") {
		throw new Error(`unknown fit "${value}"; use declared or bounds`);
	}
	return value;
}

interface NumberBounds {
	min?: number;
	exclusiveMin?: boolean;
}

function parseNumber(
	value: string | undefined,
	name: string,
	fallback: number,
	bounds: NumberBounds,
): number {
	if (value === undefined) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${value}"`);
	if (bounds.min !== undefined) {
		if (bounds.exclusiveMin ? n <= bounds.min : n < bounds.min) {
			throw new Error(`--${name} must be ${bounds.exclusiveMin ? ">" : ">="} ${bounds.min}`);
		}
	}
	return n;
}

// default transparent, except mp4 which has no alpha and defaults to white.
function parseBackground(value: string | undefined, format: Format): Rgba {
	if (value === undefined) {
		return format === "mp4" ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0, g: 0, b: 0, a: 0 };
	}
	const color = parseColor(value);
	if (!color) throw new Error(`unrecognized color "${value}"`);
	return color;
}

const NAMED: Record<string, [number, number, number]> = {
	black: [0, 0, 0],
	white: [255, 255, 255],
	red: [255, 0, 0],
	green: [0, 128, 0],
	blue: [0, 0, 255],
	gray: [128, 128, 128],
	grey: [128, 128, 128],
	yellow: [255, 255, 0],
	cyan: [0, 255, 255],
	magenta: [255, 0, 255],
};

function parseColor(raw: string): Rgba | null {
	const value = raw.trim().toLowerCase();
	if (value === "transparent" || value === "none") return { r: 0, g: 0, b: 0, a: 0 };
	if (NAMED[value]) {
		const [r, g, b] = NAMED[value];
		return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
	}
	if (value.startsWith("#")) return parseHex(value.slice(1));
	const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
	if (rgb) return parseRgbFn(rgb[1]);
	return null;
}

function parseHex(hex: string): Rgba | null {
	let r: number;
	let g: number;
	let b: number;
	let a = 255;
	if (hex.length === 3 || hex.length === 4) {
		r = parseInt(hex[0] + hex[0], 16);
		g = parseInt(hex[1] + hex[1], 16);
		b = parseInt(hex[2] + hex[2], 16);
		if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16);
	} else if (hex.length === 6 || hex.length === 8) {
		r = parseInt(hex.slice(0, 2), 16);
		g = parseInt(hex.slice(2, 4), 16);
		b = parseInt(hex.slice(4, 6), 16);
		if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16);
	} else {
		return null;
	}
	if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
	return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

function parseRgbFn(body: string): Rgba | null {
	const parts = body.split(",").map((p) => p.trim());
	if (parts.length < 3 || parts.length > 4) return null;
	const [r, g, b] = parts.map((p) => Number(p));
	const a = parts.length === 4 ? Number(parts[3]) : 1;
	if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
	return { r: r / 255, g: g / 255, b: b / 255, a };
}
