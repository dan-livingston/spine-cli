import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const subpathImports = {
	name: "subpath-imports",
	setup(build) {
		build.onResolve({ filter: /^#\// }, (args) => ({
			path: `${root}src/${args.path.slice(2)}`,
		}));
	},
};

await build({
	entryPoints: [`${root}src/render/harness/harness.ts`],
	bundle: true,
	format: "iife",
	platform: "browser",
	target: "chrome120",
	outfile: `${root}dist-harness/harness.js`,
	logLevel: "info",
	legalComments: "none",
	plugins: [subpathImports],
});
