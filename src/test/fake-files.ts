import { posix } from "node:path";

import type { Entry, EntryKind, Files } from "#/ports/files.ts";

export type Seed = string | Uint8Array;

export interface FakeFilesOptions {
	files?: Record<string, Seed>;
	dirs?: string[];
	cwd?: string;
	tempRoot?: string;
}

export interface WriteRecord {
	path: string;
	bytes: Uint8Array;
}

export function normalisePath(path: string, cwd = "/"): string {
	const slashed = path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
	const absolute = slashed.startsWith("/") ? slashed : posix.join(cwd, slashed);
	return posix.normalize(absolute).replace(/(.)\/+$/, "$1");
}

export function globToRegExp(pattern: string): RegExp {
	return new RegExp(`^${globSource(pattern)}$`);
}

function globSource(pattern: string): string {
	let out = "";
	let i = 0;
	while (i < pattern.length) {
		const char = pattern[i];
		if (pattern.startsWith("**/", i)) {
			out += "(?:.*/)?";
			i += 3;
		} else if (pattern.startsWith("**", i)) {
			out += ".*";
			i += 2;
		} else if (char === "*") {
			out += "[^/]*";
			i += 1;
		} else if (char === "?") {
			out += "[^/]";
			i += 1;
		} else if (char === "[" && pattern.indexOf("]", i + 1) > i) {
			const end = pattern.indexOf("]", i + 1);
			out += `[${pattern.slice(i + 1, end).replace(/^!/, "^")}]`;
			i = end + 1;
		} else if (char === "{" && pattern.indexOf("}", i + 1) > i) {
			const end = pattern.indexOf("}", i + 1);
			out += `(?:${pattern
				.slice(i + 1, end)
				.split(",")
				.map(globSource)
				.join("|")})`;
			i = end + 1;
		} else {
			out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
			i += 1;
		}
	}
	return out;
}

function fsError(code: string, message: string, path: string): Error {
	return Object.assign(new Error(`${code}: ${message}, '${path}'`), { code, path });
}

function ancestors(path: string): string[] {
	const found: string[] = [];
	for (let dir = posix.dirname(path); ; dir = posix.dirname(dir)) {
		found.push(dir);
		if (dir === "/") return found;
	}
}

export class FakeFiles implements Files {
	readonly cwd: string;
	readonly writes: WriteRecord[] = [];
	readonly removed: string[] = [];
	readonly madeDirs: string[] = [];
	readonly tempDirs: string[] = [];
	readonly globs: string[] = [];
	private readonly contents = new Map<string, Uint8Array>();
	private readonly directories = new Set<string>(["/"]);
	private readonly tempRoot: string;
	private tempCount = 0;

	constructor(options: FakeFilesOptions = {}) {
		this.cwd = normalisePath(options.cwd ?? "/");
		this.tempRoot = normalisePath(options.tempRoot ?? "/tmp");
		this.addDir(this.cwd);
		for (const [path, seed] of Object.entries(options.files ?? {})) this.seed(path, seed);
		for (const dir of options.dirs ?? []) this.seedDir(dir);
	}

	path(path: string): string {
		return normalisePath(path, this.cwd);
	}

	seed(path: string, seed: Seed): this {
		const key = this.path(path);
		for (const dir of ancestors(key)) this.directories.add(dir);
		this.contents.set(key, typeof seed === "string" ? new TextEncoder().encode(seed) : seed);
		return this;
	}

	seedDir(dir: string): this {
		this.addDir(this.path(dir));
		return this;
	}

	has(path: string): boolean {
		return this.contents.has(this.path(path));
	}

	hasDir(path: string): boolean {
		return this.directories.has(this.path(path));
	}

	bytes(path: string): Uint8Array {
		const key = this.path(path);
		const found = this.contents.get(key);
		if (!found) throw fsError("ENOENT", "no such file or directory, open", key);
		return found;
	}

	text(path: string): string {
		return new TextDecoder().decode(this.bytes(path));
	}

	filePaths(): string[] {
		return [...this.contents.keys()].sort();
	}

	writtenPaths(): string[] {
		return this.writes.map((record) => record.path);
	}

	async kindOf(path: string): Promise<EntryKind | null> {
		const key = this.path(path);
		if (this.contents.has(key)) return "file";
		if (this.directories.has(key)) return "directory";
		return null;
	}

	async list(dir: string): Promise<Entry[]> {
		const key = this.path(dir);
		if (this.contents.has(key)) throw fsError("ENOTDIR", "not a directory, scandir", key);
		if (!this.directories.has(key)) {
			throw fsError("ENOENT", "no such file or directory, scandir", key);
		}
		const entries: Entry[] = [];
		for (const file of this.contents.keys()) {
			if (posix.dirname(file) === key)
				entries.push({ name: posix.basename(file), kind: "file" });
		}
		for (const sub of this.directories) {
			if (sub !== key && posix.dirname(sub) === key) {
				entries.push({ name: posix.basename(sub), kind: "directory" });
			}
		}
		return entries.sort((a, b) => a.name.localeCompare(b.name));
	}

	async glob(pattern: string): Promise<string[]> {
		this.globs.push(pattern);
		const slashed = pattern.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
		const relative = !slashed.startsWith("/");
		const regex = globToRegExp(relative ? posix.join(this.cwd, slashed) : slashed);
		const candidates = [...this.contents.keys(), ...this.directories];
		return candidates
			.filter((path) => regex.test(path))
			.map((path) => (relative ? posix.relative(this.cwd, path) : path))
			.sort();
	}

	async readText(path: string): Promise<string> {
		return new TextDecoder().decode(await this.readBytes(path));
	}

	async readBytes(path: string): Promise<Uint8Array> {
		const key = this.path(path);
		if (this.directories.has(key)) {
			throw fsError("EISDIR", "illegal operation on a directory, read", key);
		}
		return this.bytes(key);
	}

	async makeDir(dir: string): Promise<void> {
		const key = this.path(dir);
		if (this.contents.has(key)) throw fsError("EEXIST", "file already exists, mkdir", key);
		this.madeDirs.push(key);
		this.addDir(key);
	}

	async write(path: string, bytes: Uint8Array): Promise<void> {
		const key = this.path(path);
		if (this.directories.has(key)) {
			throw fsError("EISDIR", "illegal operation on a directory, open", key);
		}
		if (!this.directories.has(posix.dirname(key))) {
			throw fsError("ENOENT", "no such file or directory, open", key);
		}
		const copy = Uint8Array.from(bytes);
		this.writes.push({ path: key, bytes: copy });
		this.contents.set(key, copy);
	}

	async makeTempDir(prefix: string): Promise<string> {
		this.tempCount += 1;
		const dir = posix.join(this.tempRoot, `${prefix}${this.tempCount}`);
		this.tempDirs.push(dir);
		this.addDir(dir);
		return dir;
	}

	async remove(path: string): Promise<void> {
		const key = this.path(path);
		this.removed.push(key);
		const under = (candidate: string): boolean =>
			candidate === key || candidate.startsWith(key === "/" ? "/" : `${key}/`);
		for (const file of this.contents.keys()) {
			if (under(file)) this.contents.delete(file);
		}
		for (const dir of this.directories) {
			if (under(dir) && dir !== "/") this.directories.delete(dir);
		}
	}

	private addDir(dir: string): void {
		this.directories.add(dir);
		for (const parent of ancestors(dir)) this.directories.add(parent);
	}
}
