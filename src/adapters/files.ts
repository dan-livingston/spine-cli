import type { Dirent, Stats } from "node:fs";

import { glob, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { EntryKind, Files } from "#/ports/files.ts";

export const nodeFiles: Files = {
	async kindOf(path) {
		const info = await stat(path).catch(() => null);
		return info ? kindOf(info) : null;
	},
	async list(dir) {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.map((entry) => ({ name: entry.name, kind: kindOf(entry) }));
	},
	async glob(pattern) {
		const matches: string[] = [];
		for await (const match of glob(pattern)) matches.push(match);
		return matches;
	},
	readText: (path) => readFile(path, "utf8"),
	readBytes: (path) => readFile(path),
	async makeDir(dir) {
		await mkdir(dir, { recursive: true });
	},
	write: (path, bytes) => writeFile(path, bytes),
	makeTempDir: (prefix) => mkdtemp(join(tmpdir(), prefix)),
	remove: (path) => rm(path, { recursive: true, force: true }),
};

function kindOf(entry: Stats | Dirent): EntryKind {
	if (entry.isFile()) return "file";
	if (entry.isDirectory()) return "directory";
	return "other";
}
