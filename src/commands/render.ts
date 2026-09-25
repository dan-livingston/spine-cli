import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Frame } from "#/encode/png.ts";
import type { MeasureResult } from "#/render/harness/contract.ts";
import type { RenderOptions } from "#/render/options.ts";
import type { Piece } from "#/render/pieces.ts";
import type { Job } from "#/render/plan.ts";
import type { Clip, RenderWorker } from "#/render/renderer.ts";
import type { RunParams } from "#/render/requests.ts";

import { encodeApng } from "#/encode/apng.ts";
import { findExternalEncoders } from "#/encode/external.ts";
import { encodeGif } from "#/encode/gif.ts";
import { encodePng, writePngSequence } from "#/encode/png.ts";
import { encodeVideo } from "#/encode/video.ts";
import { encodeWebp } from "#/encode/webp.ts";
import { resolveInputs } from "#/input/resolve.ts";
import {
	parseBackground,
	parseFit,
	parseFormat,
	parseNumber,
	parseWebpLossyQuality,
} from "#/render/options.ts";
import { assertDistinctPieceNames } from "#/render/pieces.ts";
import { assertNoOutputCollisions, planJobs } from "#/render/plan.ts";
import { RenderPool } from "#/render/renderer.ts";
import { buildMeasureReq, buildRequest, pickBox } from "#/render/requests.ts";

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
	const lossyQuality = parseWebpLossyQuality(options.quality, format);

	assertDistinctPieceNames(pieceSpecs);

	const inputs = await resolveInputs(target, options.atlas, (path, reason) => {
		console.warn(`skip ${path}: ${reason}`);
	});

	const jobs = planJobs(inputs, {
		batch: inputs.length > 1,
		animation: options.animation,
		pieceSpecs,
		format,
		out: options.out,
		outDir: options.outDir,
	});
	if (jobs.length === 0) throw new Error(`no renderable skeletons found for "${target}"`);
	assertNoOutputCollisions(jobs);
	if (options.out && jobs.length > 1) {
		throw new Error(
			`--out writes a single output but ${jobs.length} are planned; use --out-dir`,
		);
	}

	if (options.dryRun) {
		printDryRun(jobs);
		return;
	}

	const encoders = await findExternalEncoders(format);
	const pool = await RenderPool.launch();
	try {
		const jobsBySkeleton = [...groupBy(jobs, (j) => j.input.jsonPath).values()];
		await runJobs(pool, jobsBySkeleton, Math.min(concurrency, inputs.length), {
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
			lossyQuality,
			...encoders,
		});
	} finally {
		await pool.close();
	}
}

function printDryRun(jobs: Job[]): void {
	for (const job of jobs) {
		console.log(`${job.target.path}${job.target.isDir ? "/ (png sequence)" : ""}`);
	}
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
	const groups = new Map<K, T[]>();
	for (const item of items) {
		const list = groups.get(key(item));
		if (list) list.push(item);
		else groups.set(key(item), [item]);
	}
	return groups;
}

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

async function renderGroup(worker: RenderWorker, group: Job[], params: RunParams): Promise<void> {
	const input = group[0].input;
	const { id } = await worker.createSession(input, params.scale);
	try {
		for (const [animation, jobs] of groupBy(group, (j) => j.animation)) {
			if (jobs[0].piece) {
				await renderAlignedPieces(worker, id, animation, jobs, params);
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

async function renderAlignedPieces(
	worker: RenderWorker,
	id: number,
	animation: string,
	jobs: Job[],
	params: RunParams,
): Promise<void> {
	const boxes = await measureFramingBoxes(worker, id, animation, jobs, params);
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

async function measureFramingBoxes(
	worker: RenderWorker,
	id: number,
	animation: string,
	jobs: Job[],
	params: RunParams,
): Promise<MeasureResult | undefined> {
	if (params.fit === "declared") return undefined;
	const pieces = jobs.map((j) => piece(j).slots);
	return worker.measure(id, buildMeasureReq(animation, pieces, params));
}

function piece(job: Job): Piece {
	if (!job.piece) throw new Error(`internal: job for ${job.target.path} has no piece`);
	return job.piece;
}

function logWrote(job: Job, clip: Clip): void {
	console.log(
		`wrote ${job.target.path}${job.target.isDir ? `/ (${clip.frames.length} frames)` : ""}`,
	);
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
	} else if (params.format === "webp") {
		if (!params.img2webp) throw new Error("img2webp unavailable");
		await encodeWebp(params.img2webp, job.target.path, frames, params.fps, params.lossyQuality);
	}
}

function toFrames(clip: Clip): Frame[] {
	return clip.frames.map((data) => ({ width: clip.width, height: clip.height, data }));
}
