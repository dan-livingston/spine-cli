import type { Format } from "#/render/formats.ts";
import type { Piece } from "#/render/pieces.ts";
import type { ResolvedInput } from "#/types.ts";

import { planOutput } from "#/render/output-path.ts";
import { resolvePieces } from "#/render/pieces.ts";

export interface Job {
	input: ResolvedInput;
	animation: string;
	piece?: Piece;
	target: { path: string; isDir: boolean };
}

export interface JobPlan {
	batch: boolean;
	animation?: string;
	pieceSpecs: string[];
	format: Format;
	out?: string;
	outDir?: string;
}

export function planJobs(inputs: ResolvedInput[], plan: JobPlan): Job[] {
	return inputs.flatMap((input) => {
		try {
			return planSkeletonJobs(input, plan);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			if (!plan.batch) throw new Error(`${input.skeletonName}: ${reason}`);
			console.warn(`skip ${input.jsonPath}: ${reason}`);
			return [];
		}
	});
}

function planSkeletonJobs(input: ResolvedInput, plan: JobPlan): Job[] {
	assertTexturesExist(input);
	const { skeleton } = input;
	const animations = selectAnimations(skeleton.animations, plan.animation);
	const pieces: (Piece | undefined)[] =
		plan.pieceSpecs.length > 0
			? resolvePieces(input, skeleton.slots, plan.pieceSpecs, (spec) => {
					const reason = `--piece "${spec}" matched no slots`;
					if (!plan.batch) throw new Error(reason);
					console.warn(`skip ${input.jsonPath}: ${reason}`);
				})
			: [undefined];
	return animations.flatMap((animation) =>
		pieces.map((piece) => ({
			input,
			animation,
			piece,
			target: planOutput({
				jsonPath: input.jsonPath,
				skeletonName: input.skeletonName,
				animation,
				piece: piece?.name,
				format: plan.format,
				out: plan.out,
				outDir: plan.outDir,
			}),
		})),
	);
}

function assertTexturesExist(input: ResolvedInput): void {
	const missing = input.atlas.pages.filter((p) => !p.textureExists);
	if (missing.length > 0) {
		throw new Error(
			`atlas texture missing on disk: ${missing.map((p) => p.texturePath).join(", ")}`,
		);
	}
}

export function assertNoOutputCollisions(jobs: Job[]): void {
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
}

function selectAnimations(names: string[], requested: string | undefined): string[] {
	if (names.length === 0) throw new Error("skeleton has no animations");
	if (requested === "all") return names;
	if (requested) {
		if (!names.includes(requested)) {
			throw new Error(`no animation "${requested}"; have: ${names.join(", ")}`);
		}
		return [requested];
	}
	if (names.length === 1) return names;
	throw new Error(
		`multiple animations, pass --animation <name> or all; have: ${names.join(", ")}`,
	);
}
