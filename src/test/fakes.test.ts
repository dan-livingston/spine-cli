import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { fakeEnv } from "#/test/fake-env.ts";
import { FakeFiles, globToRegExp, normalisePath } from "#/test/fake-files.ts";
import { FakeProcesses } from "#/test/fake-processes.ts";
import { FakeRenderPool, solidClip } from "#/test/fake-render-pool.ts";

const background = { r: 0, g: 0, b: 0, a: 0 };

const timing = { animation: "idle", fps: 30, duration: 1, loops: 1, fit: "declared" as const };

describe("normalisePath", () => {
	it("folds native absolute paths onto the seeded posix form", () => {
		expect(normalisePath(resolve("/proj/hero.json"))).toBe("/proj/hero.json");
		expect(normalisePath("C:\\proj\\sub\\..\\hero.json")).toBe("/proj/hero.json");
		expect(normalisePath("assets/a.json", "/work")).toBe("/work/assets/a.json");
		expect(normalisePath("/proj/out/")).toBe("/proj/out");
	});
});

describe("FakeFiles", () => {
	const files = (): FakeFiles =>
		new FakeFiles({
			files: {
				"/proj/hero.json": "{}",
				"/proj/hero.atlas": "atlas",
				"/proj/nested/deep/boss.json": "{}",
				"/proj/nested/notes.txt": "x",
			},
			dirs: ["/proj/empty"],
		});

	it("implies directories from seeded paths and lists them", async () => {
		const fs = files();
		expect(await fs.kindOf("/proj/nested/deep")).toBe("directory");
		expect(await fs.kindOf(resolve("/proj/hero.json"))).toBe("file");
		expect(await fs.kindOf("/proj/missing.json")).toBeNull();
		expect(await fs.list("/proj")).toEqual([
			{ name: "empty", kind: "directory" },
			{ name: "hero.atlas", kind: "file" },
			{ name: "hero.json", kind: "file" },
			{ name: "nested", kind: "directory" },
		]);
		await expect(fs.list("/nope")).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.list("/proj/hero.json")).rejects.toMatchObject({ code: "ENOTDIR" });
	});

	it("globs with * and ** against absolute and relative patterns", async () => {
		const fs = new FakeFiles({
			cwd: "/proj",
			files: {
				"/proj/hero.json": "{}",
				"/proj/nested/deep/boss.json": "{}",
				"/proj/nested/notes.txt": "x",
			},
		});
		expect(await fs.glob("/proj/*.json")).toEqual(["/proj/hero.json"]);
		expect(await fs.glob("/proj/**/*.json")).toEqual([
			"/proj/hero.json",
			"/proj/nested/deep/boss.json",
		]);
		expect(await fs.glob("nested/**/*.{json,txt}")).toEqual([
			"nested/deep/boss.json",
			"nested/notes.txt",
		]);
		expect(await fs.glob(join(resolve("/proj"), "*.json"))).toEqual(["/proj/hero.json"]);
		expect(fs.globs).toHaveLength(4);
	});

	it("translates glob syntax into anchored regular expressions", () => {
		expect(globToRegExp("/a/?.json").test("/a/b.json")).toBe(true);
		expect(globToRegExp("/a/[!x]*.json").test("/a/x1.json")).toBe(false);
		expect(globToRegExp("/a/*.json").test("/a/b/c.json")).toBe(false);
	});

	it("reads back writes and records them", async () => {
		const fs = files();
		await fs.makeDir("/out/clips");
		await fs.write("/out/clips/a.png", new Uint8Array([1, 2, 3]));
		expect(fs.bytes("/out/clips/a.png")).toEqual(new Uint8Array([1, 2, 3]));
		expect(await fs.readBytes(resolve("/out/clips/a.png"))).toEqual(new Uint8Array([1, 2, 3]));
		expect(fs.writtenPaths()).toEqual(["/out/clips/a.png"]);
		expect(fs.madeDirs).toEqual(["/out/clips"]);
		expect(await fs.readText("/proj/hero.atlas")).toBe("atlas");
		expect(fs.text("/proj/hero.json")).toBe("{}");
	});

	it("refuses writes into a missing directory and reads of missing files", async () => {
		const fs = files();
		await expect(fs.write("/nowhere/a.png", new Uint8Array())).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(fs.readText("/proj/missing.json")).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.readText("/proj/nested")).rejects.toMatchObject({ code: "EISDIR" });
		expect(fs.writes).toEqual([]);
	});

	it("hands out deterministic temp dirs and removes trees recursively", async () => {
		const fs = files();
		const first = await fs.makeTempDir("spine-webp-");
		const second = await fs.makeTempDir("spine-webp-");
		expect([first, second]).toEqual(["/tmp/spine-webp-1", "/tmp/spine-webp-2"]);
		await fs.write(`${first}/0.png`, new Uint8Array([9]));
		await fs.remove(first);
		await fs.remove("/never/there");
		expect(fs.has(`${first}/0.png`)).toBe(false);
		expect(fs.hasDir(first)).toBe(false);
		expect(fs.hasDir(second)).toBe(true);
		expect(fs.removed).toEqual([first, "/never/there"]);
	});
});

describe("FakeProcesses", () => {
	it("answers version only for installed bins", async () => {
		const processes = new FakeProcesses({ installed: ["ffmpeg"] });
		expect(await processes.answersVersion("ffmpeg")).toBe(true);
		expect(await processes.answersVersion("img2webp")).toBe(false);
		expect(processes.versionChecks).toEqual(["ffmpeg", "img2webp"]);
	});

	it("records runs with args and stdin, then runs the handler", async () => {
		const seen: string[] = [];
		const processes = new FakeProcesses({ installed: ["ffmpeg"] }).onRun("ffmpeg", (run) => {
			seen.push(run.args.join(" "));
		});
		await processes.run("ffmpeg", ["-i", "-"], [new Uint8Array([1]), new Uint8Array([2])]);
		expect(processes.runs).toEqual([
			{ bin: "ffmpeg", args: ["-i", "-"], stdin: [new Uint8Array([1]), new Uint8Array([2])] },
		]);
		expect(seen).toEqual(["-i -"]);
	});

	it("fails a bin that is told to fail or is not installed", async () => {
		const processes = new FakeProcesses({ installed: ["img2webp"] }).fail("img2webp", "boom");
		await expect(processes.run("img2webp", [])).rejects.toThrow("img2webp exited 1: boom");
		await expect(processes.run("ffmpeg", [])).rejects.toMatchObject({ code: "ENOENT" });
		expect(processes.runsOf("img2webp")).toHaveLength(1);
	});
});

describe("FakeRenderPool", () => {
	it("scripts sessions and renders while recording calls", async () => {
		const pool = new FakeRenderPool();
		const worker = await pool.worker();
		const config = {
			major: "4.2" as const,
			jsonText: "{}",
			atlasText: "",
			pages: [],
			scale: 1,
		};
		const { id } = await worker.createSession(config);
		const clip = await worker.render(id, { ...timing, background, width: 3, height: 1 });
		expect(clip).toEqual(solidClip(3, 1));
		await worker.dispose(id);
		await expect(worker.render(id, { ...timing, background })).rejects.toThrow(
			"unknown session",
		);
		await pool.close();
		expect(pool.sessions[0].config).toBe(config);
		expect(pool.renders).toHaveLength(1);
		expect(pool.disposed()).toEqual([id]);
		expect(pool.closed).toBe(true);
	});

	it("uses a clip script when one is given", async () => {
		const pool = new FakeRenderPool({ clip: (req) => solidClip(1, 1, req.loops) });
		const worker = await pool.worker();
		const { id } = await worker.createSession({
			major: "4.2",
			jsonText: "",
			atlasText: "",
			pages: [],
			scale: 1,
		});
		const clip = await worker.render(id, { ...timing, loops: 3, background });
		expect(clip.frames).toHaveLength(3);
	});
});

describe("fakeEnv", () => {
	it("wires the fakes into an Env and counts launches", async () => {
		const { env, files, pool, launches } = fakeEnv({ files: { files: { "/a.json": "{}" } } });
		expect(env.files).toBe(files);
		expect(await env.files.readText("/a.json")).toBe("{}");
		expect(await env.launchRenderPool()).toBe(pool);
		expect(launches()).toBe(1);
	});

	it("can fail to launch the render pool", async () => {
		const { env } = fakeEnv({ launchError: "no chromium" });
		await expect(env.launchRenderPool()).rejects.toThrow("no chromium");
	});
});
