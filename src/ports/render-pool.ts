import type {
	MeasureRequest,
	MeasureResult,
	RenderRequest,
	SessionConfig,
	SessionMeta,
} from "#/render/harness/contract.ts";

export interface Clip {
	width: number;
	height: number;
	frames: Uint8Array[];
}

export interface RenderWorker {
	createSession(config: SessionConfig): Promise<{ id: number; meta: SessionMeta }>;
	render(id: number, req: RenderRequest): Promise<Clip>;
	measure(id: number, req: MeasureRequest): Promise<MeasureResult>;
	dispose(id: number): Promise<void>;
}

export interface RenderPool {
	worker(): Promise<RenderWorker>;
	close(): Promise<void>;
}
