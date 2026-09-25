import type { Files } from "#/ports/files.ts";
import type { Processes } from "#/ports/processes.ts";
import type { RenderPool } from "#/ports/render-pool.ts";

export interface Env {
	files: Files;
	processes: Processes;
	launchRenderPool(): Promise<RenderPool>;
}

export type Io = Pick<Env, "files" | "processes">;
