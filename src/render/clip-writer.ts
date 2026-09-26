import { dirname } from "node:path";

import type { Io } from "#/ports/env.ts";
import type { Clip } from "#/ports/render-pool.ts";
import type { Format, Tool } from "#/render/formats.ts";
import type { OutputTarget } from "#/render/output-path.ts";
import type { RunParams } from "#/render/requests.ts";

import { formatSpec, formatsWhere, listOf } from "#/render/formats.ts";
import { encodeSidecar, sheetSidecar } from "#/render/sheet-sidecar.ts";
import { arrangeSheet } from "#/render/sheet.ts";

export type ClipWriter = (target: OutputTarget, clip: Clip) => Promise<void>;

export async function openClipWriter(io: Io, params: RunParams): Promise<ClipWriter> {
	const spec = formatSpec(params.format);
	if (spec.tool) await requireTool(io, params.format, spec.tool);
	const { sheet } = params;
	return async (target, clip) => {
		if (spec.extension) await io.files.makeDir(dirname(target.path));
		const frames = clip.frames.map((data) => ({
			width: clip.width,
			height: clip.height,
			data,
		}));
		const encode = { io, path: target.path, frames, settings: params };
		if (!sheet || !spec.sheet) {
			await spec.encode(encode);
			return;
		}
		const { layout, image } = arrangeSheet(frames, sheet, params.background);
		await spec.sheet.encode({ ...encode, frames: [image] });
		if (!target.sidecar) return;
		const subject = { ...params, image: target.path, sidecar: target.sidecar };
		await io.files.write(target.sidecar, encodeSidecar(sheetSidecar(layout, subject)));
	};
}

async function requireTool(io: Io, format: Format, tool: Tool): Promise<void> {
	if (await io.processes.answersVersion(tool.command)) return;
	const toolFree = listOf(
		formatsWhere((spec) => !spec.tool),
		"and",
	);
	throw new Error(
		`${tool.command} not found on PATH; install ${tool.installs} to render ${format}. ${toolFree} work without it`,
	);
}
