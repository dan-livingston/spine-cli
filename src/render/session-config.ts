import type { Files } from "#/ports/files.ts";
import type { SessionConfig } from "#/render/harness/contract.ts";
import type { AtlasPage, ResolvedInput } from "#/types.ts";

export async function sessionConfig(
	files: Files,
	input: ResolvedInput,
	scale: number,
): Promise<SessionConfig> {
	const pages: SessionConfig["pages"] = [];
	for (const page of input.atlas.pages) {
		pages.push({ name: page.name, dataUrl: await textureDataUrl(files, page) });
	}
	return {
		major: input.major,
		jsonText: input.jsonText,
		atlasText: input.atlasText,
		pages,
		scale,
	};
}

async function textureDataUrl(files: Files, page: AtlasPage): Promise<string> {
	if (!page.textureExists) {
		throw new Error(`atlas texture missing on disk: ${page.texturePath}`);
	}
	const bytes = await files.readBytes(page.texturePath);
	return `data:${mime(page.name)};base64,${Buffer.from(bytes).toString("base64")}`;
}

function mime(name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
	return "image/png";
}
