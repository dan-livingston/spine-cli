export type EntryKind = "file" | "directory" | "other";

export interface Entry {
	name: string;
	kind: EntryKind;
}

export interface Files {
	kindOf(path: string): Promise<EntryKind | null>;
	list(dir: string): Promise<Entry[]>;
	glob(pattern: string): Promise<string[]>;
	readText(path: string): Promise<string>;
	readBytes(path: string): Promise<Uint8Array>;
	makeDir(dir: string): Promise<void>;
	write(path: string, bytes: Uint8Array): Promise<void>;
	makeTempDir(prefix: string): Promise<string>;
	remove(path: string): Promise<void>;
}
