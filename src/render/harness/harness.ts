import type { HarnessApi } from "#/render/harness/contract.ts";

import { measurePieces, renderAnimation } from "#/render/harness/animate.ts";
import { createSession, disposeSession } from "#/render/harness/session.ts";

declare global {
	interface Window {
		SpineHarness: HarnessApi;
	}
}

window.SpineHarness = { createSession, renderAnimation, measurePieces, disposeSession };
