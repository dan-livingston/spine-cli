import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AtlasPage, ParsedAtlas } from "../types.ts";

// parse a libgdx/spine atlas. the 4.0 and 4.2 formats differ only in region
// attribute keys (xy/size/offset vs bounds/offsets); both share the same block
// structure, which is all we need here:
//
//   <page image name>          <- no colon
//   key:value                  <- page header (size, format, filter, ...)
//   ...
//   <region name>              <- no colon, ends the header
//   key:value                  <- region attrs
//   ...
//   <region name>
//   ...
//   <blank line>               <- ends the page; next name is a new page
//
// texture paths resolve relative to the atlas directory.
export function parseAtlas(atlasText: string, atlasDir: string): ParsedAtlas {
	const lines = atlasText.split(/\r\n|\r|\n/);
	const pages: AtlasPage[] = [];
	let i = 0;
	const n = lines.length;

	while (i < n) {
		while (i < n && lines[i].trim() === "") i++;
		if (i >= n) break;

		const name = lines[i].trim();
		i++;

		let width = 0;
		let height = 0;
		// page header: key:value lines until the first attribute-less line
		while (i < n && lines[i].trim() !== "" && lines[i].includes(":")) {
			const [key, value] = splitEntry(lines[i]);
			if (key === "size") {
				const [w, h] = value.split(",").map((v) => Number(v.trim()));
				if (Number.isFinite(w)) width = w;
				if (Number.isFinite(h)) height = h;
			}
			i++;
		}

		const regions: string[] = [];
		// regions until the page-ending blank line
		while (i < n && lines[i].trim() !== "") {
			regions.push(lines[i].trim());
			i++;
			// skip this region's attribute lines
			while (i < n && lines[i].trim() !== "" && lines[i].includes(":")) i++;
		}

		const texturePath = resolve(atlasDir, name);
		pages.push({
			name,
			width,
			height,
			texturePath,
			textureExists: existsSync(texturePath),
			regions,
		});
	}

	return { pages };
}

function splitEntry(line: string): [string, string] {
	const idx = line.indexOf(":");
	return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
}
