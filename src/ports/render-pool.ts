import type { RenderRequest, SessionConfig } from "#/render/harness/contract.ts";

export interface Clip {
	width: number;
	height: number;
	frames: Uint8Array[];
}

export interface RenderWorker {
	createSession(config: SessionConfig): Promise<{ id: number }>;
	render(id: number, req: RenderRequest): Promise<Clip>;
	dispose(id: number): Promise<void>;
}

export interface RenderPool {
	worker(): Promise<RenderWorker>;
	close(): Promise<void>;
}
