// shared contracts across the CLI. node-side only; the browser harness has its
// own view of the data passed to it.

// spine json format broke between 4.0 and 4.1; targets straddle it, so we only
// need to dispatch between a 4.0-era and a 4.2-era runtime.
export type SpineMajor = "4.0" | "4.2";

// one atlas page (a single texture) and the regions packed onto it.
export interface AtlasPage {
	// image filename as written in the atlas, e.g. "Joker.png"
	name: string;
	width: number;
	height: number;
	// absolute path the image resolves to (may not exist on disk)
	texturePath: string;
	textureExists: boolean;
	regions: string[];
}

export interface ParsedAtlas {
	pages: AtlasPage[];
}

// a fully resolved render/inspect input: skeleton json plus its atlas and the
// textures the atlas references.
export interface ResolvedInput {
	// absolute path to the skeleton .json
	jsonPath: string;
	// basename without extension, e.g. "Joker"
	skeletonName: string;
	jsonText: string;
	// absolute path to the resolved .atlas / .atlas.txt
	atlasPath: string;
	atlasText: string;
	atlas: ParsedAtlas;
	// full version string from the json "spine" field, e.g. "4.2.40"
	version: string;
	major: SpineMajor;
}
