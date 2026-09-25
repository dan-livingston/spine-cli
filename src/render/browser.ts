import type { Browser } from "playwright-core";

import { chromium } from "playwright-core";

const SOFTWARE_WEBGL_ARGS = [
	"--use-gl=angle",
	"--use-angle=swiftshader",
	"--disable-gpu-sandbox",
	"--no-sandbox",
];

const LINUX_SYSTEM_CHROME = "/usr/bin/google-chrome";

export async function launchBrowser(): Promise<Browser> {
	const args = SOFTWARE_WEBGL_ARGS;
	const systemChromeChannel = () => chromium.launch({ headless: true, channel: "chrome", args });
	const playwrightBundledChromium = () => chromium.launch({ headless: true, args });
	const linuxSystemChrome = () =>
		chromium.launch({ headless: true, executablePath: LINUX_SYSTEM_CHROME, args });
	let lastErr: unknown;
	for (const attempt of [systemChromeChannel, playwrightBundledChromium, linuxSystemChrome]) {
		try {
			return await attempt();
		} catch (err) {
			lastErr = err;
		}
	}
	const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
	throw new Error(`could not launch a browser for rendering: ${reason}`);
}
