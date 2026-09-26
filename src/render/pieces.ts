export interface Piece {
	name: string;
	slots: string[];
}

export interface PieceSelection {
	pieces: Piece[];
	unmatched: string[];
}

export function resolvePieces(names: string[], specs: string[]): PieceSelection {
	if (names.length === 0) throw new Error("skeleton has no slots to select pieces from");
	const selection: PieceSelection = { pieces: [], unmatched: [] };
	for (const spec of specs) {
		const globs = spec
			.split(",")
			.map((g) => g.trim())
			.filter(Boolean);
		if (globs.length === 0) throw new Error(`empty --piece spec`);
		const patterns = globs.map(slotGlobToRegex);
		const slots = names.filter((n) => patterns.some((re) => re.test(n)));
		if (slots.length === 0) selection.unmatched.push(spec);
		else selection.pieces.push({ name: filenameSafePieceName(spec), slots });
	}
	return selection;
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
