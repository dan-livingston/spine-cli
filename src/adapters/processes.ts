import type { Writable } from "node:stream";

import { spawn } from "node:child_process";

import type { Processes } from "#/ports/processes.ts";

export const nodeProcesses: Processes = {
	answersVersion(bin) {
		return new Promise((resolve) => {
			const child = spawn(bin, ["-version"], { stdio: "ignore" });
			child.on("error", () => resolve(false));
			child.on("close", (code) => resolve(code === 0));
		});
	},
	run(bin, args, stdin) {
		return new Promise((resolve, reject) => {
			const child = spawn(bin, args, {
				stdio: [stdin ? "pipe" : "ignore", "ignore", "pipe"],
			});
			let stderr = "";
			child.stderr?.on("data", (d) => {
				stderr += String(d);
			});
			child.on("error", reject);
			child.on("close", (code) => {
				if (code === 0) resolve();
				else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`));
			});
			if (stdin && child.stdin) void pipeChunks(child.stdin, stdin).catch(reject);
		});
	},
};

async function pipeChunks(stdin: Writable, chunks: Uint8Array[]): Promise<void> {
	for (const chunk of chunks) {
		if (!stdin.write(chunk)) {
			await new Promise<void>((resolve) => stdin.once("drain", resolve));
		}
	}
	stdin.end();
}
