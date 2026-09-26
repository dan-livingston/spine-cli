import { describe, expect, it } from "vite-plus/test";

import { majorFor } from "#/spine/version.ts";

describe("majorFor", () => {
	it("uses the 4.0 runtime for 4.0 exports", () => {
		expect(majorFor("4.0.64")).toBe("4.0");
		expect(majorFor("4.0")).toBe("4.0");
	});

	it("uses the 4.0 runtime for exports older than 4.0", () => {
		expect(majorFor("3.8.99")).toBe("4.0");
	});

	it("uses the 4.2 runtime for 4.1 and 4.2 exports", () => {
		expect(majorFor("4.1.24")).toBe("4.2");
		expect(majorFor("4.2.43")).toBe("4.2");
		expect(majorFor("4.10.1")).toBe("4.2");
	});

	it("names the version it cannot read", () => {
		expect(() => majorFor("4")).toThrow('unrecognized spine version "4"');
		expect(() => majorFor("latest")).toThrow('unrecognized spine version "latest"');
	});
});
