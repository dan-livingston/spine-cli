import type { Browser } from "playwright-core";

import { chromium } from "playwright-core";

// swiftshader angle keeps webgl working headless without a real gpu.
const ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--no-sandbox"];

// launch chromium robustly: prefer the system chrome channel (no download needed),
// then a bundled build, then an explicit system path.
export async function launchBrowser(): Promise<Browser> {
	const attempts: (() => Promise<Browser>)[] = [
		() => chromium.launch({ headless: true, channel: "chrome", args: ARGS }),
		() => chromium.launch({ headless: true, args: ARGS }),
		() =>
			chromium.launch({
				headless: true,
				executablePath: "/usr/bin/google-chrome",
				args: ARGS,
			}),
	];
	let lastErr: unknown;
	for (const attempt of attempts) {
		try {
			return await attempt();
		} catch (err) {
			lastErr = err;
		}
	}
	const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
	throw new Error(`could not launch a browser for rendering: ${reason}`);
}
