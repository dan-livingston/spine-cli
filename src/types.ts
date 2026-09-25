export type SpineMajor = "4.0" | "4.2";

export interface AtlasPage {
	name: string;
	width: number;
	height: number;
	texturePath: string;
	textureExists: boolean;
	regions: string[];
}

export interface ParsedAtlas {
	pages: AtlasPage[];
}

export interface ResolvedInput {
	jsonPath: string;
	skeletonName: string;
	jsonText: string;
	atlasPath: string;
	atlasText: string;
	atlas: ParsedAtlas;
	version: string;
	major: SpineMajor;
}
