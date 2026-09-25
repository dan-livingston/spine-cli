import type { ResolvedInput } from "#/types.ts";

export interface Piece {
	name: string;
	slots: string[];
}

export function resolvePieces(
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
		const patterns = globs.map(slotGlobToRegex);
		const slots = names.filter((n) => patterns.some((re) => re.test(n)));
		if (slots.length === 0) {
			onNoMatch(spec);
			continue;
		}
		pieces.push({ name: filenameSafePieceName(spec), slots });
	}
	return pieces;
}

function slotGlobToRegex(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${body}$`);
}

export function assertDistinctPieceNames(specs: string[]): void {
	const byName = new Map<string, string>();
	for (const spec of specs) {
		const name = filenameSafePieceName(spec);
		const prev = byName.get(name);
		if (prev !== undefined) {
			throw new Error(
				`--piece "${prev}" and "${spec}" both map to output name "${name}"; rename one`,
			);
		}
		byName.set(name, spec);
	}
}

function filenameSafePieceName(spec: string): string {
	const name = spec
		.replace(/\*/g, "")
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return name || "piece";
}
