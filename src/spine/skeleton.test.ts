import { describe, expect, it } from "vite-plus/test";

import { parseSkeleton } from "#/spine/skeleton.ts";

const withHeader = (body: Record<string, unknown>): string =>
	JSON.stringify({ skeleton: { spine: "4.2.43" }, ...body });

describe("parseSkeleton version", () => {
	it("reads the version and runtime major from the skeleton header", () => {
		const json = JSON.stringify({
			skeleton: { hash: "x", spine: "4.2.43", width: 10 },
			bones: [],
		});
		expect(parseSkeleton(json)).toMatchObject({ version: "4.2.43", major: "4.2" });
	});

	it("falls back to a top-level spine field", () => {
		expect(parseSkeleton(JSON.stringify({ spine: "4.0.64" }))).toMatchObject({
			version: "4.0.64",
			major: "4.0",
		});
		expect(parseSkeleton(JSON.stringify({ skeleton: {}, spine: "4.1.20" })).version).toBe(
			"4.1.20",
		);
	});

	it("rejects text that is not JSON", () => {
		expect(() => parseSkeleton("{ not json")).toThrow("skeleton file is not valid JSON");
		expect(() => parseSkeleton("")).toThrow("skeleton file is not valid JSON");
	});

	it.each([
		JSON.stringify({ skeleton: { width: 1 } }),
		JSON.stringify({ skeleton: { spine: "" } }),
		JSON.stringify({ skeleton: { spine: 4.2 } }),
		"[]",
		"null",
		"42",
		'"4.2"',
		'{ "skeleton": null }',
	])("reports a missing version for %s", (text) => {
		expect(() => parseSkeleton(text)).toThrow('skeleton json has no "spine" version field');
	});

	it("names a version it cannot map to a runtime", () => {
		expect(() => parseSkeleton(JSON.stringify({ spine: "latest" }))).toThrow(
			'unrecognized spine version "latest"',
		);
	});
});

describe("parseSkeleton names", () => {
	it("reads animation names from the animations record and slot names from the slots array", () => {
		const skeleton = parseSkeleton(
			withHeader({
				animations: { idle: {}, run: {} },
				slots: [{ name: "body" }, { name: "head", bone: "root" }],
			}),
		);
		expect(skeleton.animations).toEqual(["idle", "run"]);
		expect(skeleton.slots).toEqual(["body", "head"]);
	});

	it("has no animations or slots when the keys are missing", () => {
		expect(parseSkeleton(withHeader({}))).toMatchObject({ animations: [], slots: [] });
	});

	it.each([
		["a string", "idle"],
		["an array", [{}]],
	])("reads no animations when animations is %s", (_, animations) => {
		expect(parseSkeleton(withHeader({ animations })).animations).toEqual([]);
	});

	it.each([
		["null", [null]],
		["without a name", [{}]],
		["with a non-string name", [{ name: 3 }]],
	])("skips a slot entry that is %s", (_, slots) => {
		expect(parseSkeleton(withHeader({ slots: [...slots, { name: "body" }] })).slots).toEqual([
			"body",
		]);
	});

	it("reads no slots from a slots object, which spine-ts cannot load", () => {
		expect(parseSkeleton(withHeader({ slots: { a: {} } })).slots).toEqual([]);
	});

	it("keeps the raw record for detailed reporting", () => {
		expect(parseSkeleton(withHeader({ bones: [{ name: "root" }] })).data.bones).toEqual([
			{ name: "root" },
		]);
	});
});
