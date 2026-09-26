import type { Browser, Page } from "playwright-core";

import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import type { Clip, RenderPool, RenderWorker } from "#/ports/render-pool.ts";
import type { HarnessApi, RenderRequest, SessionConfig } from "#/render/harness/contract.ts";

import { framesPerBatch } from "#/render/frame-batch.ts";

type HarnessWindow = typeof globalThis & { SpineHarness: HarnessApi };

const SOFTWARE_WEBGL_ARGS = [
	"--use-gl=angle",
	"--use-angle=swiftshader",
	"--disable-gpu-sandbox",
	"--no-sandbox",
];

const LINUX_SYSTEM_CHROME = "/usr/bin/google-chrome";

export async function launchPlaywrightPool(): Promise<RenderPool> {
	const harnessPath = await findHarnessInAncestorDirs();
	const harnessJs = await readFile(harnessPath, "utf8");
	const browser = await launchBrowser();
	return new PlaywrightPool(browser, harnessJs);
}

async function launchBrowser(): Promise<Browser> {
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

async function findHarnessInAncestorDirs(): Promise<string> {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (;;) {
		const candidate = join(dir, "dist-harness", "harness.js");
		if (await exists(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) {
			throw new Error('render harness not built; run "pnpm build:harness" first');
		}
		dir = parent;
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

class PlaywrightPool implements RenderPool {
	private readonly browser: Browser;
	private readonly harnessJs: string;

	constructor(browser: Browser, harnessJs: string) {
		this.browser = browser;
		this.harnessJs = harnessJs;
	}

	async worker(): Promise<RenderWorker> {
		const page = await this.browser.newPage();
		const errors: string[] = [];
		page.on("pageerror", (err) => errors.push(err.message));
		await page.addScriptTag({ content: this.harnessJs });
		await page.evaluate(() => {
			if (!(window as HarnessWindow).SpineHarness) {
				throw new Error("harness did not attach window.SpineHarness");
			}
		});
		return new PlaywrightWorker(page, errors);
	}

	async close(): Promise<void> {
		await this.browser.close();
	}
}

class PlaywrightWorker implements RenderWorker {
	private readonly page: Page;
	private readonly errors: string[];

	constructor(page: Page, errors: string[]) {
		this.page = page;
		this.errors = errors;
	}

	async createSession(config: SessionConfig): Promise<{ id: number }> {
		return this.withPageErrors(() =>
			this.page.evaluate(
				(cfg) => (window as HarnessWindow).SpineHarness.createSession(cfg),
				config,
			),
		);
	}

	async render(id: number, req: RenderRequest): Promise<Clip> {
		const clip = await this.withPageErrors(() =>
			this.page.evaluate(
				(a) => (window as HarnessWindow).SpineHarness.startClip(a.id, a.req),
				{ id, req },
			),
		);
		const maxFrames = framesPerBatch(clip.width, clip.height);
		const frames: Uint8Array[] = [];
		while (frames.length < clip.frameCount) {
			const batch = await this.withPageErrors(() =>
				this.page.evaluate(
					(a) => (window as HarnessWindow).SpineHarness.nextFrames(a.id, a.maxFrames),
					{ id, maxFrames },
				),
			);
			frames.push(...batch.map((b64) => base64ToBytes(b64)));
		}
		return { width: clip.width, height: clip.height, frames };
	}

	async dispose(id: number): Promise<void> {
		await this.page.evaluate(
			(sid) => (window as HarnessWindow).SpineHarness.disposeSession(sid),
			id,
		);
	}

	private async withPageErrors<T>(fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} catch (err) {
			const base = err instanceof Error ? err.message : String(err);
			const extra = this.errors.length ? ` (page error: ${this.errors.join("; ")})` : "";
			throw new Error(base + extra);
		}
	}
}

function base64ToBytes(b64: string): Uint8Array {
	return new Uint8Array(Buffer.from(b64, "base64"));
}
