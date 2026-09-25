import type { Clip, RenderPool, RenderWorker } from "#/ports/render-pool.ts";
import type {
	Box,
	MeasureRequest,
	MeasureResult,
	RenderRequest,
	SessionConfig,
	SessionMeta,
} from "#/render/harness/contract.ts";

export type ClipScript = Clip | ((req: RenderRequest, session: SessionRecord) => Clip);

export type MeasureScript =
	| MeasureResult
	| ((req: MeasureRequest, session: SessionRecord) => MeasureResult);

export interface FakeRenderPoolOptions {
	meta?: Partial<SessionMeta>;
	clip?: ClipScript;
	measure?: MeasureScript;
	createSessionError?: string;
}

export interface SessionRecord {
	id: number;
	worker: number;
	config: SessionConfig;
	disposed: boolean;
}

export interface RenderRecord {
	id: number;
	worker: number;
	req: RenderRequest;
}

export interface MeasureRecord {
	id: number;
	worker: number;
	req: MeasureRequest;
}

export const DEFAULT_BOX: Box = { x: 0, y: 0, width: 100, height: 100 };

export const DEFAULT_META: SessionMeta = {
	animations: [{ name: "idle", duration: 1 }],
	skins: ["default"],
	slots: [],
	declared: DEFAULT_BOX,
};

export function solidClip(
	width = 2,
	height = 2,
	frameCount = 1,
	rgba: [number, number, number, number] = [255, 0, 0, 255],
): Clip {
	const frame = (): Uint8Array => {
		const data = new Uint8Array(width * height * 4);
		for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
		return data;
	};
	return { width, height, frames: Array.from({ length: frameCount }, frame) };
}

function defaultMeasure(req: MeasureRequest, meta: SessionMeta): MeasureResult {
	return {
		perPiece: req.pieces.map(() => ({ ...DEFAULT_BOX })),
		selectedUnion: { ...DEFAULT_BOX },
		skeletonUnion: { ...DEFAULT_BOX },
		declared: { ...meta.declared },
	};
}

export class FakeRenderPool implements RenderPool {
	readonly meta: SessionMeta;
	readonly sessions: SessionRecord[] = [];
	readonly renders: RenderRecord[] = [];
	readonly measures: MeasureRecord[] = [];
	readonly workers: RenderWorker[] = [];
	closed = false;
	closeCount = 0;
	private readonly options: FakeRenderPoolOptions;
	private nextId = 1;

	constructor(options: FakeRenderPoolOptions = {}) {
		this.options = options;
		this.meta = { ...DEFAULT_META, ...options.meta };
	}

	disposed(): number[] {
		return this.sessions.filter((session) => session.disposed).map((session) => session.id);
	}

	openSessions(): SessionRecord[] {
		return this.sessions.filter((session) => !session.disposed);
	}

	async worker(): Promise<RenderWorker> {
		if (this.closed) throw new Error("render pool is closed");
		const index = this.workers.length;
		const worker: RenderWorker = {
			createSession: async (config) => this.createSession(index, config),
			render: async (id, req) => this.render(index, id, req),
			measure: async (id, req) => this.measure(index, id, req),
			dispose: async (id) => this.dispose(id),
		};
		this.workers.push(worker);
		return worker;
	}

	async close(): Promise<void> {
		this.closed = true;
		this.closeCount += 1;
	}

	private createSession(
		worker: number,
		config: SessionConfig,
	): { id: number; meta: SessionMeta } {
		if (this.options.createSessionError) throw new Error(this.options.createSessionError);
		const id = this.nextId++;
		this.sessions.push({ id, worker, config, disposed: false });
		return { id, meta: structuredClone(this.meta) };
	}

	private render(worker: number, id: number, req: RenderRequest): Clip {
		const session = this.session(id);
		this.renders.push({ id, worker, req: structuredClone(req) });
		const script = this.options.clip ?? solidClip(req.width ?? 2, req.height ?? 2);
		return typeof script === "function" ? script(req, session) : script;
	}

	private measure(worker: number, id: number, req: MeasureRequest): MeasureResult {
		const session = this.session(id);
		this.measures.push({ id, worker, req: structuredClone(req) });
		const script = this.options.measure;
		if (!script) return defaultMeasure(req, this.meta);
		return typeof script === "function" ? script(req, session) : script;
	}

	private dispose(id: number): void {
		this.session(id).disposed = true;
	}

	private session(id: number): SessionRecord {
		const found = this.sessions.find((session) => session.id === id && !session.disposed);
		if (!found) throw new Error(`unknown session ${id}`);
		return found;
	}
}
