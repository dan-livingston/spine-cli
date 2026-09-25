import type { AtlasPage, ResolvedInput } from "#/types.ts";

export interface SkeletonShape {
	animations?: string[];
	slots?: string[] | Record<string, unknown>;
}

export function skeletonJson(shape: SkeletonShape): string {
	const animations = Object.fromEntries(
		(shape.animations ?? []).map((name) => [name, { bones: {} }]),
	);
	const slots = Array.isArray(shape.slots)
		? shape.slots.map((name) => ({ name, bone: "root", attachment: name }))
		: shape.slots;
	return JSON.stringify({
		skeleton: { spine: "4.2.22", width: 100, height: 100 },
		bones: [{ name: "root" }],
		slots,
		animations,
	});
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
		jsonText: skeletonJson({ animations: animations ?? ["idle"], slots: slots ?? ["body"] }),
		atlasPath: `/proj/${skeletonName}.atlas`,
		atlasText: "",
		atlas: { pages: [atlasPage(`${skeletonName}.png`)] },
		version: "4.2.22",
		major: "4.2",
		...rest,
	};
}
