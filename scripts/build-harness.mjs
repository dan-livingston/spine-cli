import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
	entryPoints: [`${root}src/render/harness/harness.ts`],
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "chrome120",
	outfile: `${root}dist-harness/harness.js`,
	logLevel: "info",
	legalComments: "none",
});
