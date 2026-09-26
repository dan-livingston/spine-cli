import type { Files } from "#/ports/files.ts";
import type { Job, JobRequest } from "#/render/plan-skeleton.ts";
import type { ResolvedInput } from "#/types.ts";

import { collectJsonPaths, resolveInput } from "#/input/resolve.ts";
import { planSkeleton } from "#/render/plan-skeleton.ts";

export type { Job } from "#/render/plan-skeleton.ts";

export interface PlanRequest extends JobRequest {
	target: string;
	atlas?: string;
}

export interface Skip {
	path: string;
	reason: string;
	piece?: string;
}

export interface RenderPlan {
	jobs: Job[];
	skipped: Skip[];
}

export class PlanError extends Error {
	readonly skipped: Skip[];

	constructor(message: string, skipped: Skip[]) {
		super(message);
		this.skipped = skipped;
	}
}

export async function planRender(files: Files, request: PlanRequest): Promise<RenderPlan> {
	const paths = await collectJsonPaths(files, request.target);
	const batch = paths.length > 1;
	const plan: RenderPlan = { jobs: [], skipped: [] };
	const skipOrThrow = (path: string, err: unknown, prefix = ""): void => {
		const reason = err instanceof Error ? err.message : String(err);
		if (!batch) throw new Error(`${prefix}${reason}`);
		plan.skipped.push({ path, reason });
	};

	for (const path of paths) {
		let input: ResolvedInput;
		try {
			input = await resolveInput(files, path, request.atlas);
		} catch (err) {
			skipOrThrow(path, err);
			continue;
		}
		try {
			const { jobs, unmatchedPieces } = planSkeleton(input, request);
			if (!batch && unmatchedPieces.length > 0) {
				throw new Error(`--piece "${unmatchedPieces[0]}" matched no slots`);
			}
			plan.jobs.push(...jobs);
			for (const piece of unmatchedPieces) {
				plan.skipped.push({ path: input.jsonPath, reason: "matched no slots", piece });
			}
		} catch (err) {
			skipOrThrow(input.jsonPath, err, `${input.skeletonName}: `);
		}
	}

	const failure = planFailure(request, plan.jobs);
	if (failure) throw new PlanError(failure, plan.skipped);
	return plan;
}

function planFailure(request: PlanRequest, jobs: Job[]): string | undefined {
	if (jobs.length === 0) return `no renderable skeletons found for "${request.target}"`;
	if (request.out && jobs.length > 1) {
		return `--out writes a single output but ${jobs.length} are planned; use --out-dir`;
	}
	return outputCollision(jobs);
}

function outputCollision(jobs: Job[]): string | undefined {
	const byPath = new Map<string, string>();
	for (const job of jobs) {
		const prev = byPath.get(job.target.path);
		if (prev) {
			return `output collision: "${prev}" and "${job.input.jsonPath}" both write ${job.target.path}; rename or render separately`;
		}
		byPath.set(job.target.path, job.input.jsonPath);
	}
	return undefined;
}
