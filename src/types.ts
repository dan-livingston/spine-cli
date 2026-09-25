export type SpineMajor = "4.0" | "4.2";

export interface AtlasPageLayout {
	name: string;
	width: number;
	height: number;
	texturePath: string;
	regions: string[];
}

export interface AtlasPage extends AtlasPageLayout {
	textureExists: boolean;
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
