import { describe, expect, it } from "vite-plus/test";

import { framesPerBatch } from "#/render/frame-batch.ts";

describe("framesPerBatch", () => {
	it("fits as many frames as 64MB of RGBA holds", () => {
		expect(framesPerBatch(1024, 1024)).toBe(16);
		expect(framesPerBatch(1169, 1046)).toBe(13);
	});

	it("sends a frame bigger than the budget on its own", () => {
		expect(framesPerBatch(8192, 8192)).toBe(1);
	});
});
