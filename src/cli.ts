#!/usr/bin/env node
import { Command } from "commander";

import pkg from "../package.json" with { type: "json" };
import { infoCommand } from "./commands/info.ts";
import { renderCommand } from "./commands/render.ts";

const program = new Command();

program
	.name("spine-cli")
	.description("Render exported Spine skeletal assets and report skeleton info.")
	.version(pkg.version);

program
	.command("info <skeleton>")
	.description("Report spine version, animations, skins, counts, and atlas info")
	.option("--atlas <path>", "atlas file (auto-resolved beside the skeleton by default)")
	.option("--json", "output as JSON")
	.option("--verbose", "include per-animation and per-atlas-page detail")
	.action(run(infoCommand));

program
	.command("render <target>")
	.description("Render an animation to images or video (file, directory, or glob)")
	.option("--atlas <path>", "atlas file (auto-resolved beside the skeleton by default)")
	.option("-a, --animation <name>", "animation name, or 'all' (required if skeleton has >1)")
	.option(
		"-f, --format <format>",
		"pngseq | png | gif | mp4 | webm | webp | apng (default pngseq)",
	)
	.option("-o, --out <path>", "output file (single input)")
	.option("--out-dir <dir>", "output directory (batch or explicit dir)")
	.option("--fps <n>", "frames per second (default 30)")
	.option("--scale <f>", "uniform scale (default 1.0)")
	.option("--width <px>", "output width (overrides scale)")
	.option("--height <px>", "output height (overrides scale)")
	.option("--fit <mode>", "declared | bounds | piece | shared (default declared)")
	.option(
		"--piece <glob>",
		"render only these slots as a separate output; repeatable; comma-joins globs",
		collect,
		[],
	)
	.option("--skin <name>", "skin to apply")
	.option("--duration <sec>", "clip duration (default animation length)")
	.option("--loops <n>", "loop the animation n times")
	.option("--frame <t>", "single still at time t seconds (for --format png)")
	.option("--background <color>", "css color or 'transparent' (default transparent)")
	.option("--quality <n>", "webp lossy quality 0-100 (omit for lossless)")
	.option("--concurrency <n>", "parallel skeletons in batch (default 1)")
	.option("--dry-run", "list what would be written without rendering")
	.action(run(renderCommand));

program.parseAsync().catch(fail);

// commander collector for repeatable options.
function collect(value: string, previous: string[]): string[] {
	previous.push(value);
	return previous;
}

// wrap a command action so errors print cleanly and exit non-zero.
function run<A extends unknown[]>(
	fn: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
	return async (...args: A) => {
		try {
			await fn(...args);
		} catch (err) {
			fail(err);
		}
	};
}

function fail(err: unknown): never {
	console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
