import { dirname } from "node:path";

import type { Io } from "#/ports/env.ts";
import type { Clip } from "#/ports/render-pool.ts";
import type { Format, Tool } from "#/render/formats.ts";
import type { OutputTarget } from "#/render/output-path.ts";
import type { RunParams } from "#/render/requests.ts";

import { formatSpec, formatsWhere, listOf } from "#/render/formats.ts";
import { writeSheet } from "#/render/sheet-writer.ts";

export type ClipWriter = (target: OutputTarget, clip: Clip) => Promise<string[]>;

export async function openClipWriter(io: Io, params: RunParams): Promise<ClipWriter> {
	const spec = formatSpec(params.format);
	const { sheet } = params;
	const tool = sheet ? spec.sheet?.tool : spec.tool;
	if (tool) await requireTool(io, params.format, tool);
	return async (target, clip) => {
		if (spec.extension) await io.files.makeDir(dirname(target.path));
		const frames = clip.frames.map((data) => ({
			width: clip.width,
			height: clip.height,
			data,
		}));
		const job = { io, path: target.path, frames, settings: params };
		if (sheet && spec.sheet) return writeSheet(job, spec.sheet, sheet, target.sidecar);
		await spec.encode(job);
		return [];
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
