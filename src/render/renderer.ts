import type { Browser, Page } from "playwright-core";

import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ResolvedInput } from "../types.ts";

import { launchBrowser } from "./browser.ts";

// mirrors the config the browser harness expects.
interface SessionConfig {
	major: "4.0" | "4.2";
	jsonText: string;
	atlasText: string;
	pages: { name: string; dataUrl: string }[];
	scale: number;
}

export interface AnimationMeta {
	name: string;
	duration: number;
}

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type Fit = "declared" | "bounds" | "piece" | "shared";

export interface SessionMeta {
	animations: AnimationMeta[];
	skins: string[];
	slots: string[];
	declared: Box;
}

export interface RenderRequest {
	animation: string;
	skin?: string;
	fps: number;
	duration: number;
	loops: number;
	times?: number[];
	fit: Fit;
	// only draw these slots (a piece); undefined draws the whole skeleton
	slots?: string[];
	// explicit framing box (scaled space); overrides fit when set
	box?: Box;
	width?: number;
	height?: number;
	background: { r: number; g: number; b: number; a: number };
	premultipliedAlpha: boolean;
}

// measure the framing boxes a set of pieces occupy over a whole clip.
export interface MeasureRequest {
	animation: string;
	skin?: string;
	fps: number;
	duration: number;
	loops: number;
	times?: number[];
	// which framing box the caller will read; measure only computes that one
	fit: Fit;
	pieces: string[][];
}

export interface MeasureResult {
	perPiece: Box[];
	selectedUnion: Box;
	skeletonUnion: Box;
	declared: Box;
}

// a decoded clip: raw rgba frames (top-down), all sized width x height.
export interface Clip {
	width: number;
	height: number;
	frames: Uint8Array[];
}

// shape of the api the harness attaches to window.
interface HarnessApi {
	createSession(config: SessionConfig): Promise<{ id: number; meta: SessionMeta }>;
	renderAnimation(
		id: number,
		req: RenderRequest,
	): Promise<{ width: number; height: number; frames: string[] }>;
	measurePieces(id: number, req: MeasureRequest): Promise<MeasureResult>;
	disposeSession(id: number): void;
}
type HarnessWindow = typeof globalThis & { SpineHarness: HarnessApi };

// the harness ships in dist-harness/ at the package root. this file lives at a
// different depth in dev (src/render/) vs the built bundle (dist/), so walk up
// until we find it rather than hardcoding a relative depth.
async function findHarness(): Promise<string> {
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

// owns the browser and the harness script text; hands out one worker page each.
export class RenderPool {
	private readonly browser: Browser;
	private readonly harnessJs: string;

	private constructor(browser: Browser, harnessJs: string) {
		this.browser = browser;
		this.harnessJs = harnessJs;
	}

	static async launch(): Promise<RenderPool> {
		const harnessPath = await findHarness();
		const harnessJs = await readFile(harnessPath, "utf8");
		const browser = await launchBrowser();
		return new RenderPool(browser, harnessJs);
	}

	// a fresh page with the harness injected. errors on the page surface loudly.
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

// drives one page: build a skeleton, render animations, read frames back.
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
		return this.guard(() =>
			this.page.evaluate(
				(cfg) => (window as HarnessWindow).SpineHarness.createSession(cfg),
				config,
			),
		);
	}

	async render(id: number, req: RenderRequest): Promise<Clip> {
		const res = await this.guard(() =>
			this.page.evaluate(
				(a) => (window as HarnessWindow).SpineHarness.renderAnimation(a.id, a.req),
				{ id, req },
			),
		);
		const frames = res.frames.map((b64) => base64ToBytes(b64));
		return { width: res.width, height: res.height, frames };
	}

	async measure(id: number, req: MeasureRequest): Promise<MeasureResult> {
		return this.guard(() =>
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

	// run a page call, attaching any page-side error text if it throws.
	private async guard<T>(fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} catch (err) {
			const base = err instanceof Error ? err.message : String(err);
			const extra = this.errors.length ? ` (page error: ${this.errors.join("; ")})` : "";
			throw new Error(base + extra);
		}
	}
}

// load atlas page textures as base64 data urls the browser Image() can consume.
async function sessionConfig(input: ResolvedInput, scale: number): Promise<SessionConfig> {
	const pages: { name: string; dataUrl: string }[] = [];
	for (const page of input.atlas.pages) {
		if (!page.textureExists) {
			throw new Error(`atlas texture missing on disk: ${page.texturePath}`);
		}
		const bytes = await readFile(page.texturePath);
		pages.push({
			name: page.name,
			dataUrl: `data:${mime(page.name)};base64,${bytes.toString("base64")}`,
		});
	}
	return {
		major: input.major,
		jsonText: input.jsonText,
		atlasText: input.atlasText,
		pages,
		scale,
	};
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
