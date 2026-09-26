# spine-cli

Render exported [Spine](https://esotericsoftware.com/) skeletons to images and video, and print what a skeleton contains.

Works with JSON exports from Spine 4.0, 4.1 and 4.2 (`.json` + `.atlas` + PNG textures).

## Install

```sh
npm install -g spine-cli
```

Or run it without installing: `npx spine-cli ...`

Requirements:

- Chrome installed. Rendering runs in headless Chrome.
- `ffmpeg` on `PATH` for `mp4` and `webm`.
- `img2webp` (from libwebp) on `PATH` for `webp`.

`pngseq`, `png`, `gif` and `apng` need nothing extra.

## Info

```sh
spine-cli info hero.json
```

Prints the Spine version, animations and their durations, skins, bone, slot and attachment counts, and atlas pages. It also reports textures the atlas names but that are missing on disk.

| Option           | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| `--atlas <path>` | Atlas file. Found beside the skeleton if omitted.                                    |
| `--json`         | Print JSON.                                                                          |
| `--verbose`      | Add each animation's timeline counts and events, and each atlas page's region count. |

## Render

```sh
spine-cli render hero.json -a run -f gif -o run.gif
spine-cli render hero.json -a all -f mp4 --out-dir out/
spine-cli render characters/ -a idle -f webp
spine-cli render hero.json -a run -f png --frame 0.5
```

The target is a `.json` file, a directory (searched one level deep), or a glob. The atlas is found next to the skeleton; pass `--atlas` if there is more than one and none shares the skeleton's name.

If the skeleton has more than one animation, `-a` is required. The error lists the names.

| Option                          | Description                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `-a, --animation <name>`        | Animation name, or `all`.                                                              |
| `-f, --format <format>`         | `pngseq` (default), `png`, `gif`, `apng`, `webp`, `mp4`, `webm`.                       |
| `-o, --out <path>`              | Output file, for a single input.                                                       |
| `--out-dir <dir>`               | Output directory.                                                                      |
| `--atlas <path>`                | Atlas file.                                                                            |
| `--skin <name>`                 | Skin to apply.                                                                         |
| `--fps <n>`                     | Frames per second. Default 30.                                                         |
| `--scale <f>`                   | Uniform scale. Default 1.                                                              |
| `--width <px>`, `--height <px>` | Output size. Overrides `--scale`.                                                      |
| `--fit <mode>`                  | Framing box: `declared` (default), `bounds`, `piece`, `shared`. See [Pieces](#pieces). |
| `--piece <globs>`               | Render only matching slots. Repeatable. See [Pieces](#pieces).                         |
| `--duration <sec>`              | Clip length. Defaults to the animation's length.                                       |
| `--loops <n>`                   | Play the animation n times.                                                            |
| `--frame <t>`                   | Time in seconds of the still for `--format png`.                                       |
| `--background <color>`          | CSS color or `transparent`. Default `transparent`, `white` for `mp4`.                  |
| `--quality <0-100>`             | Lossy `webp` quality. Omit for lossless.                                               |
| `--sheet`                       | Write every frame into one `png` or `webp` image. See [Sheets](#sheets).               |
| `--rows <n>`, `--columns <n>`   | Sheet grid. Pass one. Default one row.                                                 |
| `--padding <px>`                | Gap between sheet cells. Default 0.                                                    |
| `--concurrency <n>`             | Skeletons rendered in parallel in a batch. Default 1.                                  |
| `--dry-run`                     | List the files that would be written.                                                  |

Without `-o`, files are named `{skeleton}_{animation}.{ext}` and written beside the skeleton, or into `--out-dir`. Slashes in an animation name become `_`, so `combat/attack` writes `hero_combat_attack.gif`. A batch skips skeletons it cannot load and reports them.

Format notes:

- `mp4` has no alpha. `webm` keeps it.
- `gif` has only on/off transparency, so soft edges look jagged on a transparent background. Set `--background` for cleaner edges.
- `webp` is lossless with full alpha unless you pass `--quality`.

## Sheets

```sh
spine-cli render hero.json -a run -f png --sheet
spine-cli render hero.json -a run -f webp --sheet --rows 4 --padding 2 --scale 0.5
```

`--sheet` renders every frame of the clip into one image, as a grid. It works with `png` and `webp`, the formats that write a single still. A `webp` sheet is a still image, lossless unless you pass `--quality`.

Every cell is one frame, and all frames of a clip are the same size. Frames fill left to right, then top to bottom. By default the sheet is one row.

- `--columns <n>` sets the columns. The rows are `ceil(frames / n)`.
- `--rows <n>` sets the rows. The columns are `ceil(frames / n)`, and the sheet has only as many rows as the frames fill.
- A value larger than the frame count is reduced to it, so `--columns 999` gives one row.
- `--padding <px>` puts a gap between cells, not around the edge. The gap and any empty cells in the last row take the `--background` color, transparent by default.

The sheet is `columns × frameWidth + (columns − 1) × padding` wide and `rows × frameHeight + (rows − 1) × padding` tall.

Sheets are named like any other output. Each one gets a sidecar beside it, named after the image with `.sheet.json` in place of the extension: `hero_run.png` writes `hero_run.sheet.json`, and `-o run.webp` writes `run.sheet.json`. `--dry-run` lists both.

```json
{
	"image": "hero_run.png",
	"format": "png",
	"frameWidth": 256,
	"frameHeight": 320,
	"columns": 30,
	"rows": 1,
	"frameCount": 30,
	"fps": 30,
	"padding": 0,
	"frames": [{ "x": 0, "y": 0, "w": 256, "h": 320 }]
}
```

`image` is relative to the sidecar. `frames` has one rect per frame, in play order.

`--frame` and `--loops` do not apply to a sheet and are rejected with it. `--rows`, `--columns` and `--padding` are rejected without `--sheet`, and `--rows` with `--columns`.

Size limits:

- `webp` holds at most 16383 px a side. A larger `webp` sheet is an error that names its size. Use a smaller `--scale`, a lower `--fps`, or `--rows`/`--columns`. In a batch, the skeleton is skipped and the rest render.
- A `png` sheet over 8192 px a side is written, with a warning that browsers and GPUs may refuse it.

A single-row sheet plays in a browser with CSS alone. Size an element to one frame, and step `background-position` across the strip:

```sh
spine-cli render hero.json -a run -f png --sheet --scale 0.5
```

```css
.hero {
	width: 128px;
	height: 160px;
	background: url(hero_run.png);
	animation: run 1s steps(30) infinite;
}

@keyframes run {
	to {
		background-position: -3840px 0;
	}
}
```

Take the numbers from the sidecar: the duration is `frameCount / fps` seconds, and the end position is minus the sheet width.

For a game engine, a grid with padding keeps texture filtering from bleeding between frames:

```sh
spine-cli render hero.json -a all -f png --sheet --columns 8 --padding 2 --out-dir sheets/
```

## Pieces

`--piece` renders a subset of slots as its own output. Each value is one or more comma-separated slot globs (`*`, `?`). Each `--piece` flag produces one file, named `{skeleton}_{animation}_{piece}.{ext}`.

`--fit` sets the box the output is framed to:

| Mode       | Box                                         | Layers line up |
| ---------- | ------------------------------------------- | -------------- |
| `declared` | The skeleton's declared width and height.   | Yes            |
| `bounds`   | The bounds of every slot in the skeleton.   | Yes            |
| `shared`   | The combined bounds of the selected pieces. | Yes            |
| `piece`    | Each piece's own bounds. Smallest files.    | No             |

Bounds cover every frame of the clip, so the output size doesn't change between frames. `piece` and `shared` need at least one `--piece`.

Three layers of one animation that stack back into the full image:

```sh
spine-cli render vault.json -a open -f apng --fit shared \
	--piece "door/*" --piece "chips/*" --piece "background/*"
```

## Development

```sh
pnpm install
pnpm build   # check, bundle the browser harness, build the CLI
pnpm test
node dist/cli.mjs info path/to/skeleton.json
```

Rendering uses the `spine-ts` WebGL runtime in headless Chrome via Playwright. The 4.0 and 4.2 runtimes are bundled into `dist-harness/`, and the one used is picked from the version in the skeleton file (4.2 also reads 4.1). Run `pnpm build:harness` after changing `src/render/harness/`.

## License

MIT
