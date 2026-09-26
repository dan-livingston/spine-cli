import type { Format } from "#/render/formats.ts";
import type { OutputTarget } from "#/render/output-path.ts";
import type { Piece } from "#/render/pieces.ts";
import type { SheetParams } from "#/render/sheet.ts";
import type { ResolvedInput } from "#/types.ts";

import { planOutput } from "#/render/output-path.ts";
import { resolvePieces } from "#/render/pieces.ts";

export interface Job {
	input: ResolvedInput;
	animation: string;
	piece?: Piece;
	target: OutputTarget;
}

export interface JobRequest {
	animation?: string;
	pieceSpecs: string[];
	format: Format;
	out?: string;
	outDir?: string;
	sheet?: SheetParams;
}

export interface SkeletonPlan {
	jobs: Job[];
	unmatchedPieces: string[];
}

export function planSkeleton(input: ResolvedInput, request: JobRequest): SkeletonPlan {
	assertTexturesExist(input);
	const { skeleton } = input;
	const animations = selectAnimations(skeleton.animations, request.animation);
	const { pieces, unmatched } =
		request.pieceSpecs.length > 0
			? resolvePieces(skeleton.slots, request.pieceSpecs)
			: { pieces: [undefined], unmatched: [] };
	const jobs = animations.flatMap((animation) =>
		pieces.map((piece) => ({
			input,
			animation,
			piece,
			target: planOutput({
				jsonPath: input.jsonPath,
				skeletonName: input.skeletonName,
				animation,
				piece: piece?.name,
				format: request.format,
				out: request.out,
				outDir: request.outDir,
				sheet: request.sheet !== undefined,
			}),
		})),
	);
	return { jobs, unmatchedPieces: unmatched };
}

function assertTexturesExist(input: ResolvedInput): void {
	const missing = input.atlas.pages.filter((p) => !p.textureExists);
	if (missing.length > 0) {
		throw new Error(
			`atlas texture missing on disk: ${missing.map((p) => p.texturePath).join(", ")}`,
		);
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
