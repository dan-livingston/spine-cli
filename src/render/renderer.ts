import type { Browser, Page } from "playwright-core";

import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
	HarnessApi,
	MeasureRequest,
	MeasureResult,
	RenderRequest,
	SessionConfig,
	SessionMeta,
} from "#/render/harness/contract.ts";
import type { AtlasPage, ResolvedInput } from "#/types.ts";

import { launchBrowser } from "#/render/browser.ts";

export interface Clip {
	width: number;
	height: number;
	frames: Uint8Array[];
}

type HarnessWindow = typeof globalThis & { SpineHarness: HarnessApi };

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

export class RenderPool {
	private readonly browser: Browser;
	private readonly harnessJs: string;

	private constructor(browser: Browser, harnessJs: string) {
		this.browser = browser;
		this.harnessJs = harnessJs;
	}

	static async launch(): Promise<RenderPool> {
		const harnessPath = await findHarnessInAncestorDirs();
		const harnessJs = await readFile(harnessPath, "utf8");
		const browser = await launchBrowser();
		return new RenderPool(browser, harnessJs);
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
		return new RenderWorker(page, errors);
	}

	async close(): Promise<void> {
		await this.browser.close();
	}
}

export class RenderWorker {
	private readonly page: Page;
	private readonly errors: string[];

	constructor(page: Page, errors: string[]) {
		this.page = page;
		this.errors = errors;
	}

	async createSession(
		input: ResolvedInput,
		scale: number,
	): Promise<{ id: number; meta: SessionMeta }> {
		const config = await sessionConfig(input, scale);
		return this.withPageErrors(() =>
			this.page.evaluate(
				(cfg) => (window as HarnessWindow).SpineHarness.createSession(cfg),
				config,
			),
		);
	}

	async render(id: number, req: RenderRequest): Promise<Clip> {
		const res = await this.withPageErrors(() =>
			this.page.evaluate(
				(a) => (window as HarnessWindow).SpineHarness.renderAnimation(a.id, a.req),
				{ id, req },
			),
		);
		const frames = res.frames.map((b64) => base64ToBytes(b64));
		return { width: res.width, height: res.height, frames };
	}

	async measure(id: number, req: MeasureRequest): Promise<MeasureResult> {
		return this.withPageErrors(() =>
			this.page.evaluate(
				(a) => (window as HarnessWindow).SpineHarness.measurePieces(a.id, a.req),
				{ id, req },
			),
		);
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

async function sessionConfig(input: ResolvedInput, scale: number): Promise<SessionConfig> {
	const pages: SessionConfig["pages"] = [];
	for (const page of input.atlas.pages) {
		pages.push({ name: page.name, dataUrl: await textureDataUrl(page) });
	}
	return {
		major: input.major,
		jsonText: input.jsonText,
		atlasText: input.atlasText,
		pages,
		scale,
	};
}

async function textureDataUrl(page: AtlasPage): Promise<string> {
	if (!page.textureExists) {
		throw new Error(`atlas texture missing on disk: ${page.texturePath}`);
	}
	const bytes = await readFile(page.texturePath);
	return `data:${mime(page.name)};base64,${bytes.toString("base64")}`;
}

function mime(name: string): string {
	const lower = name.toLowerCase();
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
	return "image/png";
}

function base64ToBytes(b64: string): Uint8Array {
	return new Uint8Array(Buffer.from(b64, "base64"));
}
