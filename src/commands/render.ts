import type { Env, Io } from "#/ports/env.ts";
import type { Clip, RenderPool, RenderWorker } from "#/ports/render-pool.ts";
import type { MeasureResult } from "#/render/harness/contract.ts";
import type { RenderOptions } from "#/render/options.ts";
import type { Piece } from "#/render/pieces.ts";
import type { Job } from "#/render/plan.ts";
import type { RunParams } from "#/render/requests.ts";

import { findExternalEncoders } from "#/encode/external.ts";
import { resolveInputs } from "#/input/resolve.ts";
import { assertNoOutputCollisions, planJobs } from "#/render/plan.ts";
import { buildMeasureReq, buildRequest, pickBox } from "#/render/requests.ts";
import { sessionConfig } from "#/render/session-config.ts";
import { parseRenderSettings } from "#/render/settings.ts";
import { writeClip } from "#/render/write-clip.ts";

export async function renderCommand(
	env: Env,
	target: string,
	options: RenderOptions,
): Promise<void> {
	const { concurrency, pieceSpecs, dryRun, ...settings } = parseRenderSettings(options);

	const inputs = await resolveInputs(env.files, target, options.atlas, (path, reason) => {
		console.warn(`skip ${path}: ${reason}`);
	});

	const jobs = planJobs(inputs, {
		batch: inputs.length > 1,
		animation: options.animation,
		pieceSpecs,
		format: settings.format,
		out: options.out,
		outDir: options.outDir,
	});
	if (jobs.length === 0) throw new Error(`no renderable skeletons found for "${target}"`);
	if (options.out && jobs.length > 1) {
		throw new Error(
			`--out writes a single output but ${jobs.length} are planned; use --out-dir`,
		);
	}
	assertNoOutputCollisions(jobs);

	if (dryRun) {
		printDryRun(jobs);
		return;
	}

	const encoders = await findExternalEncoders(env.processes, settings.format);
	const pool = await env.launchRenderPool();
	try {
		const jobsBySkeleton = [...groupBy(jobs, (j) => j.input.jsonPath).values()];
		await runJobs(env, pool, jobsBySkeleton, Math.min(concurrency, inputs.length), {
			...settings,
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
	env: Env,
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
			await renderGroup(env, worker, group, params);
		}
	};

	await Promise.all(Array.from({ length: Math.max(1, workers) }, run));
}

async function renderGroup(
	env: Env,
	worker: RenderWorker,
	group: Job[],
	params: RunParams,
): Promise<void> {
	const input = group[0].input;
	const { id } = await worker.createSession(await sessionConfig(env.files, input, params.scale));
	try {
		for (const [animation, jobs] of groupBy(group, (j) => j.animation)) {
			if (jobs[0].piece) {
				await renderAlignedPieces(env, worker, id, animation, jobs, params);
			} else {
				for (const job of jobs) {
					const clip = await worker.render(id, buildRequest(animation, params));
					await writeClip(env, job, clip, params);
					logWrote(job, clip);
				}
			}
		}
	} finally {
		await worker.dispose(id);
	}
}

async function renderAlignedPieces(
	io: Io,
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
		await writeClip(io, job, clip, params);
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
