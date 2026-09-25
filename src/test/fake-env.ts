import type { Env } from "#/ports/env.ts";
import type { FakeFilesOptions } from "#/test/fake-files.ts";
import type { FakeProcessesOptions } from "#/test/fake-processes.ts";
import type { FakeRenderPoolOptions } from "#/test/fake-render-pool.ts";

import { FakeFiles } from "#/test/fake-files.ts";
import { FakeProcesses } from "#/test/fake-processes.ts";
import { FakeRenderPool } from "#/test/fake-render-pool.ts";

export interface FakeEnvOptions {
	files?: FakeFiles | FakeFilesOptions;
	processes?: FakeProcesses | FakeProcessesOptions;
	pool?: FakeRenderPool | FakeRenderPoolOptions;
	launchError?: string;
}

export interface FakeEnv {
	env: Env;
	files: FakeFiles;
	processes: FakeProcesses;
	pool: FakeRenderPool;
	launches: () => number;
}

export function fakeEnv(options: FakeEnvOptions = {}): FakeEnv {
	const files = options.files instanceof FakeFiles ? options.files : new FakeFiles(options.files);
	const processes =
		options.processes instanceof FakeProcesses
			? options.processes
			: new FakeProcesses(options.processes);
	const pool =
		options.pool instanceof FakeRenderPool ? options.pool : new FakeRenderPool(options.pool);
	let launchCount = 0;
	const env: Env = {
		files,
		processes,
		async launchRenderPool() {
			launchCount += 1;
			if (options.launchError) throw new Error(options.launchError);
			return pool;
		},
	};
	return { env, files, processes, pool, launches: () => launchCount };
}
