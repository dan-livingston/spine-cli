import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Frame } from "../encode/png.ts";
import type { Format, OutputContext } from "../render/output-path.ts";
import type {
	Box,
	Clip,
	Fit,
	MeasureRequest,
	MeasureResult,
	RenderRequest,
} from "../render/renderer.ts";
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
	quality?: string;
	piece?: string[];
	concurrency?: string;
	dryRun?: boolean;
}

interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

// one piece of a skeleton: a name (for the filename) and the resolved slots it
// draws. absent for a whole-skeleton render.
interface Piece {
	name: string;
	slots: string[];
}

// a single unit of work: one animation of one skeleton (optionally one piece) to
// one output target.
interface Job {
	input: ResolvedInput;
	animation: string;
	includeAnimation: boolean;
	piece?: Piece;
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
	const pieceSpecs = options.piece ?? [];
	const fit = parseFit(options.fit, pieceSpecs.length > 0);
	const background = parseBackground(options.background, format);
	const quality = parseQuality(options.quality, format);

	// two --piece specs can normalize to the same filename; catch it up front (the
	// specs apply to every skeleton) instead of as an opaque output collision that
	// names the same input twice.
	assertDistinctPieceNames(pieceSpecs);

	const inputs = await resolveInputs(target, options.atlas, (path, reason) => {
		console.warn(`skip ${path}: ${reason}`);
	});
	const batch = inputs.length > 1;

	// plan every job up front so --dry-run and naming share one code path. bad
	// inputs (missing texture, no animation) are skipped in a batch and surfaced
	// for a single target, mirroring resolveInputs' skip-and-continue design.
	const jobs: Job[] = [];
	const skip = (input: ResolvedInput, reason: string): boolean => {
		if (!batch) throw new Error(`${input.skeletonName}: ${reason}`);
		console.warn(`skip ${input.jsonPath}: ${reason}`);
		return true;
	};
	for (const input of inputs) {
		const missing = input.atlas.pages.filter((p) => !p.textureExists);
		if (missing.length > 0) {
			if (
				skip(
					input,
					`atlas texture missing on disk: ${missing.map((p) => p.texturePath).join(", ")}`,
				)
			)
				continue;
		}
		// parse the skeleton json once; animation and slot names both come from it
		const skeleton = readSkeleton(input);
		let animations: string[];
		try {
			animations = selectAnimations(input, skeleton.animations, options.animation);
		} catch (err) {
			if (skip(input, err instanceof Error ? err.message : String(err))) continue;
			animations = [];
		}
		let pieces: Piece[] | undefined;
		if (pieceSpecs.length > 0) {
			try {
				// a spec that matches no slot on this skeleton drops just that piece in
				// a batch (keeping the skeleton's other pieces); fatal for a single target.
				pieces = resolvePieces(input, skeleton.slots, pieceSpecs, (spec) => {
					// non-batch: throw so the catch's skip() surfaces it fatally (skip
					// prepends the skeleton name). batch: warn and drop just this piece.
					if (!batch) throw new Error(`--piece "${spec}" matched no slots`);
					console.warn(`skip ${input.jsonPath}: --piece "${spec}" matched no slots`);
				});
			} catch (err) {
				if (skip(input, err instanceof Error ? err.message : String(err))) continue;
				animations = [];
			}
			// every spec missed on this skeleton: nothing piece-related to render
			if (pieces && pieces.length === 0) continue;
		}
		const includeAnimation = batch || animations.length > 1;
		for (const animation of animations) {
			const emit = (piece?: Piece): void => {
				const ctx: OutputContext = {
					jsonPath: input.jsonPath,
					skeletonName: input.skeletonName,
					animation,
					includeAnimation,
					piece: piece?.name,
					format,
					out: options.out,
					outDir: options.outDir,
				};
				jobs.push({ input, animation, includeAnimation, piece, target: planOutput(ctx) });
			};
			if (pieces) pieces.forEach((p) => emit(p));
			else emit();
		}
	}

	if (jobs.length === 0) throw new Error(`no renderable skeletons found for "${target}"`);

	// two skeletons with the same basename from different dirs would map to the
	// same output and silently overwrite; catch it before rendering.
	const byPath = new Map<string, string>();
	for (const job of jobs) {
		const prev = byPath.get(job.target.path);
		if (prev) {
			throw new Error(
				`output collision: "${prev}" and "${job.input.jsonPath}" both write ${job.target.path}; rename or render separately`,
			);
		}
		byPath.set(job.target.path, job.input.jsonPath);
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

	// mp4/webm/webp need a real ffmpeg; fail early with a clear message before launching.
	let ffmpeg: string | null = null;
	if (format === "mp4" || format === "webm" || format === "webp") {
		ffmpeg = await findFfmpeg();
		if (!ffmpeg) {
			throw new Error(
				`ffmpeg not found on PATH; install ffmpeg to render ${format}. pngseq, png, gif and apng work without it`,
			);
		}
	}

	const pool = await RenderPool.launch();
	try {
		// group jobs by their skeleton so a worker builds each skeleton once.
		const groups = [...groupBy(jobs, (j) => j.input.jsonPath).values()];
		await runJobs(pool, groups, Math.min(concurrency, inputs.length), {
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
			quality,
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
	fit: Fit;
	width?: number;
	height?: number;
	skin?: string;
	background: Rgba;
	format: Format;
	// webp only: 0-100 lossy quality; undefined means lossless.
	quality?: number;
	ffmpeg: string | null;
}

// group items by a key, preserving first-seen order (Map keeps insertion order).
function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const item of items) {
		const list = groups.get(key(item));
		if (list) list.push(item);
		else groups.set(key(item), [item]);
	}
	return groups;
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
	const { id } = await worker.createSession(input, params.scale);
	try {
		for (const [animation, jobs] of groupBy(group, (j) => j.animation)) {
			// pieces of one animation share a measure pass so their boxes align
			if (jobs[0].piece) {
				await renderPieces(worker, id, animation, jobs, params);
			} else {
				for (const job of jobs) {
					const clip = await worker.render(id, buildRequest(animation, params));
					await writeClip(job, clip, params);
					logWrote(job, clip);
				}
			}
		}
	} finally {
		await worker.dispose(id);
	}
}

// render every piece of one animation, framed by a single measure pass so all
// pieces stay aligned (or tightly cropped, for --fit piece).
async function renderPieces(
	worker: Awaited<ReturnType<RenderPool["worker"]>>,
	id: number,
	animation: string,
	jobs: Job[],
	params: RunParams,
): Promise<void> {
	// --fit declared frames each piece to the artboard, which needs no measure
	// pass; only bounds/piece/shared walk the clip to find their box.
	const pieces = jobs.map((j) => piece(j).slots);
	const boxes =
		params.fit === "declared"
			? undefined
			: await worker.measure(id, buildMeasureReq(animation, pieces, params));
	for (let i = 0; i < jobs.length; i++) {
		const job = jobs[i];
		const req = buildRequest(animation, params);
		req.slots = piece(job).slots;
		if (boxes) req.box = pickBox(params.fit, boxes, i);
		const clip = await worker.render(id, req);
		await writeClip(job, clip, params);
		logWrote(job, clip);
	}
}

function piece(job: Job): Piece {
	if (!job.piece) throw new Error(`internal: job for ${job.target.path} has no piece`);
	return job.piece;
}

// map the resolved --fit onto one of the measured boxes.
function pickBox(fit: Fit, boxes: MeasureResult, i: number): Box {
	if (fit === "piece") return boxes.perPiece[i];
	if (fit === "shared") return boxes.selectedUnion;
	if (fit === "bounds") return boxes.skeletonUnion;
	return boxes.declared;
}

function logWrote(job: Job, clip: Clip): void {
	console.log(
		`wrote ${job.target.path}${job.target.isDir ? `/ (${clip.frames.length} frames)` : ""}`,
	);
}

function buildRequest(animation: string, params: RunParams): RenderRequest {
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
	return base;
}

function buildMeasureReq(animation: string, pieces: string[][], params: RunParams): MeasureRequest {
	const req: MeasureRequest = {
		animation,
		skin: params.skin,
		fps: params.fps,
		duration: params.duration ?? 0,
		loops: params.loops,
		fit: params.fit,
		pieces,
	};
	if (params.format === "png") req.times = [params.frame];
	return req;
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
	} else if (params.format === "mp4" || params.format === "webm" || params.format === "webp") {
		if (!params.ffmpeg) throw new Error("ffmpeg unavailable");
		await encodeVideo(
			params.ffmpeg,
			job.target.path,
			frames,
			params.fps,
			params.format,
			params.quality,
		);
	}
}

function toFrames(clip: Clip): Frame[] {
	return clip.frames.map((data) => ({ width: clip.width, height: clip.height, data }));
}

interface SkeletonInfo {
	animations: string[];
	slots: string[];
}

// animation and slot names live in the json; read both in one parse without a
// browser roundtrip so selection, pieces and --dry-run work identically.
function readSkeleton(input: ResolvedInput): SkeletonInfo {
	const data = JSON.parse(input.jsonText) as {
		animations?: Record<string, unknown>;
		slots?: { name: string }[] | Record<string, unknown>;
	};
	const slots = data.slots;
	return {
		animations: Object.keys(data.animations ?? {}),
		slots: Array.isArray(slots)
			? slots.map((s) => s.name)
			: slots && typeof slots === "object"
				? Object.keys(slots)
				: [],
	};
}

function selectAnimations(
	input: ResolvedInput,
	names: string[],
	requested: string | undefined,
): string[] {
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
		throw new Error(`unknown format "${value}"; use pngseq, png, gif, apng, mp4, webm or webp`);
	}
	return value;
}

function parseFit(value: string | undefined, hasPieces: boolean): Fit {
	if (value === undefined) return "declared";
	if (value !== "declared" && value !== "bounds" && value !== "piece" && value !== "shared") {
		throw new Error(`unknown fit "${value}"; use declared, bounds, piece or shared`);
	}
	if ((value === "piece" || value === "shared") && !hasPieces) {
		throw new Error(`--fit ${value} needs at least one --piece`);
	}
	return value;
}

// a --piece spec is one or more comma-separated globs; a slot joins the piece if
// any glob matches. each spec becomes one output. specs that match no slot are
// reported via onNoMatch rather than aborting, so a skeleton's other pieces still
// render.
function resolvePieces(
	input: ResolvedInput,
	names: string[],
	specs: string[],
	onNoMatch: (spec: string) => void,
): Piece[] {
	if (names.length === 0) {
		throw new Error(`${input.skeletonName}: skeleton has no slots to select pieces from`);
	}
	const pieces: Piece[] = [];
	for (const spec of specs) {
		const globs = spec
			.split(",")
			.map((g) => g.trim())
			.filter(Boolean);
		if (globs.length === 0) throw new Error(`empty --piece spec`);
		const patterns = globs.map(globToRegex);
		const slots = names.filter((n) => patterns.some((re) => re.test(n)));
		if (slots.length === 0) {
			onNoMatch(spec);
			continue;
		}
		pieces.push({ name: pieceName(spec), slots });
	}
	return pieces;
}

// glob with * (any run) and ? (one char); slot names are case-sensitive.
function globToRegex(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${body}$`);
}

// two specs that normalize to the same filename would collide on output; the
// specs apply to every skeleton, so validate them once up front.
function assertDistinctPieceNames(specs: string[]): void {
	const byName = new Map<string, string>();
	for (const spec of specs) {
		const name = pieceName(spec);
		const prev = byName.get(name);
		if (prev !== undefined) {
			throw new Error(
				`--piece "${prev}" and "${spec}" both map to output name "${name}"; rename one`,
			);
		}
		byName.set(name, spec);
	}
}

// derive a filename-safe piece name from its spec.
function pieceName(spec: string): string {
	const name = spec
		.replace(/\*/g, "")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return name || "piece";
}

interface NumberBounds {
	min?: number;
	exclusiveMin?: boolean;
	max?: number;
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
	if (bounds.max !== undefined && n > bounds.max) {
		throw new Error(`--${name} must be <= ${bounds.max}`);
	}
	return n;
}

// webp only: 0-100 lossy quality. undefined (flag omitted) means lossless. reject
// it on other formats so it never silently no-ops.
function parseQuality(value: string | undefined, format: Format): number | undefined {
	if (value === undefined) return undefined;
	if (format !== "webp") {
		throw new Error(`--quality only applies to webp; ${format} has no lossy quality knob`);
	}
	return Math.round(parseNumber(value, "quality", 0, { min: 0, max: 100 }));
}

// default transparent, except mp4 which has no alpha and defaults to white.
function parseBackground(value: string | undefined, format: Format): Rgba {
	if (value === undefined) {
		return format === "mp4" ? { r: 1, g: 1, b: 1, a: 1 } : { r: 0, g: 0, b: 0, a: 0 };
	}
	const color = parseColor(value);
	if (!color) throw new Error(`unrecognized color "${value}"`);
	// mp4 is yuv420p with no alpha; a translucent fill would silently composite
	// onto black. reject it so the user picks an opaque color or uses webm.
	if (format === "mp4" && color.a < 1) {
		throw new Error(
			`mp4 has no alpha channel; --background must be opaque (got "${value}"); use webm for transparency`,
		);
	}
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
