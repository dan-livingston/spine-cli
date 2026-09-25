import type { Processes } from "#/ports/processes.ts";

export interface RunRecord {
	bin: string;
	args: string[];
	stdin?: Uint8Array[];
}

export type RunHandler = (run: RunRecord) => void | Promise<void>;

export interface FakeProcessesOptions {
	installed?: string[];
	failures?: Record<string, string>;
}

export class FakeProcesses implements Processes {
	readonly runs: RunRecord[] = [];
	readonly versionChecks: string[] = [];
	private readonly installed: Set<string>;
	private readonly failures: Map<string, string>;
	private readonly handlers = new Map<string, RunHandler>();

	constructor(options: FakeProcessesOptions = {}) {
		this.installed = new Set(options.installed ?? []);
		this.failures = new Map(Object.entries(options.failures ?? {}));
	}

	install(...bins: string[]): this {
		for (const bin of bins) this.installed.add(bin);
		return this;
	}

	uninstall(...bins: string[]): this {
		for (const bin of bins) this.installed.delete(bin);
		return this;
	}

	fail(bin: string, stderr = "failed"): this {
		this.failures.set(bin, stderr);
		return this;
	}

	onRun(bin: string, handler: RunHandler): this {
		this.handlers.set(bin, handler);
		return this;
	}

	runsOf(bin: string): RunRecord[] {
		return this.runs.filter((run) => run.bin === bin);
	}

	async answersVersion(bin: string): Promise<boolean> {
		this.versionChecks.push(bin);
		return this.installed.has(bin);
	}

	async run(bin: string, args: string[], stdin?: Uint8Array[]): Promise<void> {
		const record: RunRecord = {
			bin,
			args: [...args],
			stdin: stdin?.map((chunk) => Uint8Array.from(chunk)),
		};
		this.runs.push(record);
		if (!this.installed.has(bin)) {
			throw Object.assign(new Error(`spawn ${bin} ENOENT`), { code: "ENOENT" });
		}
		const stderr = this.failures.get(bin);
		if (stderr !== undefined) throw new Error(`${bin} exited 1: ${stderr}`);
		await this.handlers.get(bin)?.(record);
	}
}
