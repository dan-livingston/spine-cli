import type { Env } from "#/ports/env.ts";
import type { Clip, RenderPool, RenderWorker } from "#/ports/render-pool.ts";
import type { ClipWriter } from "#/render/clip-writer.ts";
import type { RenderOptions } from "#/render/options.ts";
import type { Job, PlanRequest, RenderPlan, Skip } from "#/render/plan.ts";
import type { RunParams } from "#/render/requests.ts";

import { openClipWriter } from "#/render/clip-writer.ts";
import { PlanError, planRender } from "#/render/plan.ts";
import { buildRequest } from "#/render/requests.ts";
import { sessionConfig } from "#/render/session-config.ts";
import { parseRenderSettings } from "#/render/settings.ts";

export async function renderCommand(
	env: Env,
	target: string,
	options: RenderOptions,
): Promise<void> {
	const { concurrency, dryRun, ...settings } = parseRenderSettings(options);
	const { jobs } = await planAndReport(env, { ...settings, target });

	if (dryRun) {
		printDryRun(jobs);
		return;
	}

	const write = await openClipWriter(env, settings);
	const pool = await env.launchRenderPool();
	try {
		const jobsBySkeleton = [...groupBy(jobs, (j) => j.input.jsonPath).values()];
		await runJobs(env, pool, jobsBySkeleton, Math.min(concurrency, jobsBySkeleton.length), {
			params: settings,
			write,
		});
	} finally {
		await pool.close();
	}
}

async function planAndReport(env: Env, request: PlanRequest): Promise<RenderPlan> {
	try {
		const plan = await planRender(env.files, request);
		reportSkipped(plan.skipped);
		return plan;
	} catch (err) {
		if (err instanceof PlanError) reportSkipped(err.skipped);
		throw err;
	}
}

function reportSkipped(skipped: Skip[]): void {
	for (const { path, reason, piece } of skipped) {
		console.warn(
			piece === undefined
				? `skip ${path}: ${reason}`
				: `skip --piece "${piece}" for ${path}: ${reason}`,
		);
	}
}

function printDryRun(jobs: Job[]): void {
	for (const job of jobs) {
		console.log(`${job.target.path}${job.target.isDir ? "/ (png sequence)" : ""}`);
		if (job.target.sidecar) console.log(job.target.sidecar);
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

interface Run {
	params: RunParams;
	write: ClipWriter;
}

async function runJobs(
	env: Env,
	pool: RenderPool,
	groups: Job[][],
	workers: number,
	run: Run,
): Promise<void> {
	let next = 0;
	const take = (): Job[] | undefined => (next < groups.length ? groups[next++] : undefined);

	const drain = async (): Promise<void> => {
		const worker = await pool.worker();
		for (let group = take(); group; group = take()) {
			await renderGroup(env, worker, group, run);
		}
	};

	await Promise.all(Array.from({ length: Math.max(1, workers) }, drain));
}

async function renderGroup(env: Env, worker: RenderWorker, group: Job[], run: Run): Promise<void> {
	const input = group[0].input;
	const { id } = await worker.createSession(
		await sessionConfig(env.files, input, run.params.scale),
	);
	try {
		for (const [animation, jobs] of groupBy(group, (j) => j.animation)) {
			const groupSlots = slotUnion(jobs.flatMap((j) => j.piece?.slots ?? []));
			for (const job of jobs) {
				const req = buildRequest(animation, run.params, {
					slots: job.piece?.slots,
					groupSlots,
				});
				await writeAndLog(run, job, await worker.render(id, req));
			}
		}
	} finally {
		await worker.dispose(id);
	}
}

function slotUnion(slots: string[]): string[] | undefined {
	return slots.length > 0 ? [...new Set(slots)] : undefined;
}

async function writeAndLog(run: Run, job: Job, clip: Clip): Promise<void> {
	await run.write(job.target, clip);
	const { path, isDir, sidecar } = job.target;
	const detail = isDir ? `/ (${clip.frames.length} frames)` : sidecar ? ` and ${sidecar}` : "";
	console.log(`wrote ${path}${detail}`);
}
