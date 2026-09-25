import type { FakeEnv, FakeEnvOptions } from "#/test/fake-env.ts";

import { fakeEnv } from "#/test/fake-env.ts";
import { FakeFiles } from "#/test/fake-files.ts";

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export const TEXTURE_BYTES = new Uint8Array([1, 2, 3, 4]);

export interface SkeletonFixture {
	animations?: string[];
	slots?: string[];
	spine?: string;
}

export function skeletonJson(fixture: SkeletonFixture = {}): string {
	const animations = fixture.animations ?? ["idle"];
	const slots = fixture.slots ?? ["body", "head"];
	return JSON.stringify({
		skeleton: { spine: fixture.spine ?? "4.2.11", width: 100, height: 100 },
		bones: [{ name: "root" }],
		slots: slots.map((name) => ({ name, bone: "root", attachment: name })),
		animations: Object.fromEntries(animations.map((name) => [name, {}])),
	});
}

export function atlasText(page: string): string {
	return [page, "size: 64,64", "filter: Linear,Linear", "body", "bounds: 0,0,32,32", ""].join(
		"\n",
	);
}

export function seedSkeleton(
	files: FakeFiles,
	dir: string,
	name: string,
	fixture: SkeletonFixture = {},
): FakeFiles {
	return files
		.seed(`${dir}/${name}.json`, skeletonJson(fixture))
		.seed(`${dir}/${name}.atlas`, atlasText(`${name}.png`))
		.seed(`${dir}/${name}.png`, TEXTURE_BYTES);
}

export function heroEnv(
	fixture: SkeletonFixture = {},
	options: Omit<FakeEnvOptions, "files"> = {},
): FakeEnv {
	const files = seedSkeleton(new FakeFiles(), "/proj", "hero", fixture);
	return fakeEnv({ ...options, files });
}
