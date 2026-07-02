# spine-cli

CLI for exported [Spine](https://esotericsoftware.com/) 2D skeletal assets. Render animations to images/video, report skeleton info.

## What it does

Operates on Spine runtime exports (`.json` + `.atlas`/`.atlas.txt` + PNG textures).

- **`render`**: rasterize an animation to `pngseq` (default), `png` (single frame), `gif`, `mp4`, `webm`, `apng`.
- **`info`**: Spine version, animations + durations, skins, bone/slot/attachment/constraint counts, mesh/clipping flags, atlas pages/resolution + missing-texture check.

## How it works

- **Rendering**: `spine-ts` WebGL backend in headless Chromium (Playwright), screenshotting frames. WebGL for full mesh + clipping fidelity (both common in targets).
- **Version dispatch**: bundles `spine-ts` 4.0 + 4.2, picks per-skeleton from embedded `"spine"` field (format broke at 4.1; targets straddle it).
- **Input resolution**: pass a `.json`; single sibling `*.atlas.txt`/`*.atlas` auto-resolved (`--atlas` overrides); textures relative to atlas dir. Also accepts dir or glob for batch.
- **Video** (`mp4`/`webm`): shells out to ffmpeg, optional external binary (detected on PATH). `mp4` defaults white (no alpha); other formats default transparent.

## Usage (planned)

```
spine-cli info <skeleton.json> [--atlas <path>] [--json] [--verbose]

spine-cli render <skeleton.json | dir | glob>
    [--atlas <path>]
    --animation <name|all>                     # error+lists names if multiple and omitted
    --format <pngseq|png|gif|mp4|webm|apng>     # default pngseq
    --out <path> | --out-dir <dir>
    --fps <n>                                   # default 30
    --scale <f> | --width <px> --height <px>    # default --scale 1.0
    --fit <declared|bounds>                     # default declared (skeleton width/height)
    --skin <name>
    --duration <sec> --loops <n>
    --frame <t>                                 # single still for --format png
    --background <color|transparent>            # default transparent; white for mp4
    --concurrency <n> --dry-run
```

Batch writes `{skeleton}_{animation}.{ext}` beside each input or into `--out-dir`.

## Scripts

| script         | command           | does                      |
| -------------- | ----------------- | ------------------------- |
| `pnpm dev`     | `vp dev`          | dev server                |
| `pnpm build`   | `tsc && vp build` | production build          |
| `pnpm preview` | `vp preview`      | preview build             |
| `vp check`     |                   | format + lint + typecheck |
| `vp fmt`       |                   | format                    |
