import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AtlasPage, ParsedAtlas } from "#/types.ts";

interface Cursor {
	lines: string[];
	at: number;
}

export function parseAtlas(atlasText: string, atlasDir: string): ParsedAtlas {
	const cursor: Cursor = { lines: atlasText.split(/\r\n|\r|\n/), at: 0 };
	const pages: AtlasPage[] = [];
	while (skipBlankLines(cursor)) {
		pages.push(readPage(cursor, atlasDir));
	}
	return { pages };
}

function readPage(cursor: Cursor, atlasDir: string): AtlasPage {
	const name = nextLine(cursor);
	const { width, height } = pageSize(readAttributes(cursor));
	const regions = readRegionNames(cursor);
	const texturePath = resolve(atlasDir, name);
	return {
		name,
		width,
		height,
		texturePath,
		textureExists: existsSync(texturePath),
		regions,
	};
}

function readRegionNames(cursor: Cursor): string[] {
	const regions: string[] = [];
	while (!atPageEnd(cursor)) {
		regions.push(nextLine(cursor));
		readAttributes(cursor);
	}
	return regions;
}

function readAttributes(cursor: Cursor): Map<string, string> {
	const attributes = new Map<string, string>();
	while (!atPageEnd(cursor) && current(cursor).includes(":")) {
		const [key, value] = splitEntry(nextLine(cursor));
		attributes.set(key, value);
	}
	return attributes;
}

function pageSize(header: Map<string, string>): { width: number; height: number } {
	const [w, h] = (header.get("size") ?? "").split(",").map((v) => Number(v.trim()));
	return {
		width: Number.isFinite(w) ? w : 0,
		height: Number.isFinite(h) ? h : 0,
	};
}

function skipBlankLines(cursor: Cursor): boolean {
	while (cursor.at < cursor.lines.length && current(cursor) === "") cursor.at++;
	return cursor.at < cursor.lines.length;
}

function atPageEnd(cursor: Cursor): boolean {
	return cursor.at >= cursor.lines.length || current(cursor) === "";
}

function current(cursor: Cursor): string {
	return cursor.lines[cursor.at].trim();
}

function nextLine(cursor: Cursor): string {
	const line = current(cursor);
	cursor.at++;
	return line;
}

function splitEntry(line: string): [string, string] {
	const idx = line.indexOf(":");
	return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}
