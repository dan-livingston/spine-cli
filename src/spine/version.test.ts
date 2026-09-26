import { describe, expect, it } from "vite-plus/test";

import { majorFor, readSpineVersion } from "#/spine/version.ts";

describe("readSpineVersion", () => {
	it("reads the version from the skeleton header", () => {
		const json = JSON.stringify({
			skeleton: { hash: "x", spine: "4.2.43", width: 10 },
			bones: [],
		});
		expect(readSpineVersion(json)).toBe("4.2.43");
	});

	it("falls back to a top-level spine field", () => {
		expect(readSpineVersion(JSON.stringify({ spine: "4.0.64" }))).toBe("4.0.64");
		expect(readSpineVersion(JSON.stringify({ skeleton: {}, spine: "4.1.20" }))).toBe("4.1.20");
	});

	it("rejects text that is not JSON", () => {
		expect(() => readSpineVersion("{ not json")).toThrow("skeleton file is not valid JSON");
		expect(() => readSpineVersion("")).toThrow("skeleton file is not valid JSON");
	});

	it("rejects a skeleton without a usable version", () => {
		const message = 'skeleton json has no "spine" version field';
		expect(() => readSpineVersion(JSON.stringify({ skeleton: { width: 1 } }))).toThrow(message);
		expect(() => readSpineVersion(JSON.stringify({ skeleton: { spine: "" } }))).toThrow(
			message,
		);
		expect(() => readSpineVersion(JSON.stringify({ skeleton: { spine: 4.2 } }))).toThrow(
			message,
		);
		expect(() => readSpineVersion("[]")).toThrow(message);
	});

	it.each(["null", "42", '"4.2"', '{ "skeleton": null }'])(
		"reports a missing version for %s",
		(text) => {
			expect(() => readSpineVersion(text)).toThrow(
				'skeleton json has no "spine" version field',
			);
		},
	);
});

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
