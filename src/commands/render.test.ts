import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderCommand } from "#/commands/render.ts";
import { atlasText, heroEnv, PNG_SIGNATURE, TEXTURE_BYTES } from "#/test/cmd-render-fixtures.ts";
import { solidClip } from "#/test/fake-render-pool.ts";

let logs: string[];
let warnings: string[];

beforeEach(() => {
	logs = [];
	warnings = [];
	vi.spyOn(console, "log").mockImplementation((line: string) => {
		logs.push(line);
	});
	vi.spyOn(console, "warn").mockImplementation((line: string) => {
		warnings.push(line);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

const TARGET = "/proj/hero.json";

async function messageOf(run: Promise<void>): Promise<string> {
	const error = await run.then(
		() => new Error("expected renderCommand to reject"),
		(err: Error) => err,
	);
	return error.message;
}

describe("renderCommand with one skeleton", () => {
	it("writes a png sequence beside the skeleton by default and cleans up", async () => {
		const { env, files, pool } = heroEnv();
		await renderCommand(env, TARGET, {});

		expect(files.writtenPaths()).toEqual(["/proj/hero_idle/0001.png"]);
		expect(Array.from(files.bytes("/proj/hero_idle/0001.png").slice(0, 8))).toEqual(
			PNG_SIGNATURE,
		);
		expect(logs).toEqual([`wrote ${resolve("/proj/hero_idle")}/ (1 frames)`]);
		expect(pool.sessions).toHaveLength(1);
		expect(pool.openSessions()).toEqual([]);
		expect(pool.closeCount).toBe(1);
	});

	it("loads the skeleton, atlas and base64 texture into the session at the given scale", async () => {
		const { env, pool } = heroEnv({ spine: "4.0.64" });
		await renderCommand(env, TARGET, { scale: "0.5" });

		const config = pool.sessions[0].config;
		expect(config.major).toBe("4.0");
		expect(config.scale).toBe(0.5);
		expect(JSON.parse(config.jsonText).skeleton.spine).toBe("4.0.64");
		expect(config.atlasText.split("\n")[0]).toBe("hero.png");
		expect(config.pages).toEqual([
			{
				name: "hero.png",
				dataUrl: `data:image/png;base64,${Buffer.from(TEXTURE_BYTES).toString("base64")}`,
			},
		]);
	});

	it("sends README defaults to the renderer when no options are given", async () => {
		const { env, pool } = heroEnv();
		await renderCommand(env, TARGET, {});

		expect(pool.renders[0].req).toEqual({
			animation: "idle",
			skin: undefined,
			fps: 30,
			duration: 0,
			loops: 1,
			fit: "declared",
			times: undefined,
			width: undefined,
			height: undefined,
			background: { r: 0, g: 0, b: 0, a: 0 },
		});
	});

	it("rounds whole-number options and passes timing through to the renderer", async () => {
		const { env, pool } = heroEnv();
		await renderCommand(env, TARGET, {
			format: "apng",
			fps: "12.5",
			width: "10.6",
			height: "20.4",
			loops: "2.4",
			duration: "1.5",
			skin: "gold",
			background: "#ff0000",
		});

		expect(pool.renders[0].req).toMatchObject({
			fps: 12.5,
			width: 11,
			height: 20,
			loops: 2,
			duration: 1.5,
			skin: "gold",
			background: { r: 1, g: 0, b: 0, a: 1 },
		});
	});

	it("renders a png still at --frame and names it after the skeleton and animation", async () => {
		const { env, files, pool } = heroEnv();
		await renderCommand(env, TARGET, { format: "png", frame: "0.5" });

		expect(pool.renders[0].req.times).toEqual([0.5]);
		expect(files.writtenPaths()).toEqual(["/proj/hero_idle.png"]);
		expect(logs).toEqual([`wrote ${resolve("/proj/hero_idle.png")}`]);
	});

	it("names each output after its animation for -a all and shares one session", async () => {
		const { env, files, pool } = heroEnv({ animations: ["idle", "run"] });
		await renderCommand(env, TARGET, { animation: "all", format: "apng", outDir: "/out" });

		expect(files.writtenPaths()).toEqual(["/out/hero_idle.apng", "/out/hero_run.apng"]);
		expect(pool.renders.map((r) => r.req.animation)).toEqual(["idle", "run"]);
		expect(pool.sessions).toHaveLength(1);
	});

	it("writes to --out when given", async () => {
		const { env, files } = heroEnv({ animations: ["idle", "run"] });
		await renderCommand(env, TARGET, {
			animation: "run",
			format: "apng",
			out: "/elsewhere/r.apng",
		});

		expect(files.writtenPaths()).toEqual(["/elsewhere/r.apng"]);
	});

	it("defaults the mp4 background to opaque white and encodes through ffmpeg", async () => {
		const { env, processes, pool } = heroEnv({}, { processes: { installed: ["ffmpeg"] } });
		await renderCommand(env, TARGET, { format: "mp4" });

		expect(pool.renders[0].req.background).toEqual({ r: 1, g: 1, b: 1, a: 1 });
		const runs = processes.runsOf("ffmpeg");
		expect(runs).toHaveLength(1);
		expect(runs[0].args.at(-1)).toBe(resolve("/proj/hero_idle.mp4"));
	});

	it.each([
		[undefined, ["-lossless"]],
		["79.6", ["-lossy", "-q", "80"]],
	])("encodes webp with --quality %s through img2webp", async (quality, compression) => {
		const { env, processes } = heroEnv({}, { processes: { installed: ["img2webp"] } });
		await renderCommand(env, TARGET, { format: "webp", quality });

		const args = processes.runsOf("img2webp")[0].args;
		expect(args.slice(4, 4 + compression.length)).toEqual(compression);
		expect(args.slice(-2)).toEqual(["-o", resolve("/proj/hero_idle.webp")]);
	});

	it("logs the frame count of a png sequence written to --out", async () => {
		const { env, files } = heroEnv({}, { pool: { clip: solidClip(2, 2, 3) } });
		await renderCommand(env, TARGET, { out: "/frames" });

		expect(files.writtenPaths()).toEqual([
			"/frames/0001.png",
			"/frames/0002.png",
			"/frames/0003.png",
		]);
		expect(logs).toEqual(["wrote /frames/ (3 frames)"]);
	});

	it("loads the atlas given by --atlas", async () => {
		const { env, files, pool } = heroEnv();
		files
			.seed("/art/skin.atlas", atlasText("alt.png"))
			.seed("/art/alt.png", new Uint8Array([9]));
		await renderCommand(env, TARGET, { atlas: "/art/skin.atlas", outDir: "/out" });

		expect(pool.sessions[0].config.atlasText).toBe(atlasText("alt.png"));
		expect(pool.sessions[0].config.pages).toEqual([
			{ name: "alt.png", dataUrl: "data:image/png;base64,CQ==" },
		]);
		expect(files.writtenPaths()).toEqual(["/out/hero_idle/0001.png"]);
	});
});

describe("renderCommand option errors", () => {
	it.each([
		[{ fps: "fast" }, '--fps must be a number, got "fast"'],
		[{ fps: "0.5" }, "--fps must be >= 1"],
		[{ scale: "0" }, "--scale must be > 0"],
		[{ width: "0.4" }, "--width must be >= 1"],
		[{ duration: "0" }, "--duration must be > 0"],
		[{ loops: "0" }, "--loops must be >= 1"],
		[{ frame: "-1" }, "--frame must be >= 0"],
		[{ concurrency: "0" }, "--concurrency must be >= 1"],
		[{ format: "jpg" }, 'unknown format "jpg"; use pngseq, png, gif, apng, mp4, webm or webp'],
		[{ fit: "shared" }, "--fit shared needs at least one --piece"],
		[
			{ format: "gif", quality: "80" },
			"--quality only applies to webp; gif has no lossy quality knob",
		],
		[
			{ format: "mp4", background: "transparent" },
			'mp4 has no alpha channel; --background must be opaque (got "transparent"); use webm for transparency',
		],
		[
			{ piece: ["head*", "head"] },
			'--piece "head*" and "head" both map to output name "head"; rename one',
		],
	])("rejects %o before rendering", async (options, message) => {
		const { env, launches } = heroEnv();
		await expect(renderCommand(env, TARGET, options)).rejects.toThrow(message);
		expect(launches()).toBe(0);
	});

	it("reports a missing target", async () => {
		const { env } = heroEnv();
		await expect(renderCommand(env, "/proj/nope.json", {})).rejects.toThrow(
			"no such file or directory: /proj/nope.json",
		);
	});

	it("refuses mp4 without ffmpeg before launching the browser", async () => {
		const { env, launches } = heroEnv();
		await expect(renderCommand(env, TARGET, { format: "mp4" })).rejects.toThrow(
			"ffmpeg not found on PATH; install ffmpeg to render mp4",
		);
		expect(launches()).toBe(0);
	});

	it("refuses webp without img2webp before launching the browser", async () => {
		const { env, launches } = heroEnv();
		await expect(renderCommand(env, TARGET, { format: "webp" })).rejects.toThrow(
			"img2webp not found on PATH",
		);
		expect(launches()).toBe(0);
	});

	it("names the skeleton once when a texture is missing", async () => {
		const { env, files } = heroEnv();
		await files.remove("/proj/hero.png");
		expect(await messageOf(renderCommand(env, TARGET, {}))).toBe(
			`hero: atlas texture missing on disk: ${resolve("/proj/hero.png")}`,
		);
	});

	it("names the skeleton once when --piece matches no slot", async () => {
		const { env } = heroEnv();
		expect(await messageOf(renderCommand(env, TARGET, { piece: ["wing*"] }))).toBe(
			'hero: --piece "wing*" matched no slots',
		);
	});

	it("lists the animations when -a is required or names one that does not exist", async () => {
		const { env, launches } = heroEnv({ animations: ["idle", "run"] });
		await expect(renderCommand(env, TARGET, {})).rejects.toThrow(
			"multiple animations, pass --animation <name> or all; have: idle, run",
		);
		await expect(renderCommand(env, TARGET, { animation: "jump" })).rejects.toThrow(
			'no animation "jump"; have: idle, run',
		);
		expect(launches()).toBe(0);
	});

	it("names the skeleton once when -a is required", async () => {
		const { env } = heroEnv({ animations: ["idle", "run"] });
		expect(await messageOf(renderCommand(env, TARGET, {}))).toBe(
			"hero: multiple animations, pass --animation <name> or all; have: idle, run",
		);
	});

	it.fails("needs fix: --out with several planned outputs reports a self-collision instead of pointing to --out-dir", async () => {
		const { env, files } = heroEnv({ animations: ["idle", "run"] });
		await expect(
			renderCommand(env, TARGET, { animation: "all", format: "gif", out: "/x.gif" }),
		).rejects.toThrow("--out writes a single output but 2 are planned; use --out-dir");
		expect(files.writes).toEqual([]);
	});
});

describe("renderCommand dry run", () => {
	it("lists planned outputs without launching, checking encoders or writing", async () => {
		const { env, files, processes, launches } = heroEnv({ animations: ["idle", "run"] });
		await renderCommand(env, TARGET, { animation: "all", format: "mp4", dryRun: true });
		await renderCommand(env, TARGET, { animation: "idle", dryRun: true });

		expect(logs).toEqual([
			resolve("/proj/hero_idle.mp4"),
			resolve("/proj/hero_run.mp4"),
			`${resolve("/proj/hero_idle")}/ (png sequence)`,
		]);
		expect(launches()).toBe(0);
		expect(processes.versionChecks).toEqual([]);
		expect(files.writes).toEqual([]);
	});
});

describe("renderCommand failures", () => {
	it("disposes the session and closes the pool when a render fails", async () => {
		const { env, pool, files } = heroEnv(
			{},
			{
				pool: {
					clip: () => {
						throw new Error("webgl lost");
					},
				},
			},
		);
		await expect(renderCommand(env, TARGET, { format: "gif" })).rejects.toThrow("webgl lost");
		expect(pool.sessions).toHaveLength(1);
		expect(pool.openSessions()).toEqual([]);
		expect(pool.closeCount).toBe(1);
		expect(files.writes).toEqual([]);
	});

	it("surfaces a browser launch failure without writing", async () => {
		const { env, files } = heroEnv({}, { launchError: "chrome not found" });
		await expect(renderCommand(env, TARGET, {})).rejects.toThrow("chrome not found");
		expect(files.writes).toEqual([]);
	});

	it("closes the pool when session creation fails", async () => {
		const { env, pool } = heroEnv({}, { pool: { createSessionError: "bad skeleton" } });
		await expect(renderCommand(env, TARGET, {})).rejects.toThrow("bad skeleton");
		expect(pool.closeCount).toBe(1);
	});
});
