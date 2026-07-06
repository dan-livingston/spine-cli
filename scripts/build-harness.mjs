// bundle the browser-side render harness to a single IIFE the CLI injects into a
// headless page. spine-webgl 4.0 + 4.2 are bundled together (browser only), so
// they are never runtime deps of the node CLI.
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
