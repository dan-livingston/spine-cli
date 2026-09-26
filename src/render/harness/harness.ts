import type { HarnessApi } from "#/render/harness/contract.ts";

import { nextFrames, startClip } from "#/render/harness/animate.ts";
import { createSession, disposeSession } from "#/render/harness/session.ts";

declare global {
	interface Window {
		SpineHarness: HarnessApi;
	}
}

window.SpineHarness = { createSession, startClip, nextFrames, disposeSession };
