import type { Skeleton } from "#/spine/skeleton.ts";
import type { AtlasPage, ResolvedInput } from "#/types.ts";

export interface SkeletonShape {
	animations?: string[];
	slots?: string[];
}

export function skeletonModel(shape: SkeletonShape = {}): Skeleton {
	return {
		version: "4.2.22",
		major: "4.2",
		animations: shape.animations ?? ["idle"],
		slots: shape.slots ?? ["body"],
		data: {},
	};
}

export function atlasPage(name: string, textureExists = true): AtlasPage {
	return {
		name,
		width: 64,
		height: 64,
		texturePath: `/proj/${name}`,
		regions: ["body"],
		textureExists,
	};
}

export function resolvedInput(
	overrides: Partial<ResolvedInput> & SkeletonShape = {},
): ResolvedInput {
	const { animations, slots, ...rest } = overrides;
	const skeletonName = rest.skeletonName ?? "hero";
	return {
		jsonPath: `/proj/${skeletonName}.json`,
		skeletonName,
		jsonText: "{}",
		atlasPath: `/proj/${skeletonName}.atlas`,
		atlasText: "",
		atlas: { pages: [atlasPage(`${skeletonName}.png`)] },
		skeleton: skeletonModel({ animations, slots }),
		...rest,
	};
}
