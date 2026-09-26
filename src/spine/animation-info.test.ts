import { describe, expect, it } from "vite-plus/test";

import { parseAnimations } from "#/spine/animation-info.ts";

const none = {
	bones: 0,
	slots: 0,
	deform: 0,
	drawOrder: 0,
	ik: 0,
	transform: 0,
	path: 0,
	physics: 0,
};

describe("parseAnimations", () => {
	it("counts one timeline per keyed property of each bone, slot, path and physics constraint", () => {
		const [anim] = parseAnimations({
			swing: {
				bones: { hip: { rotate: [{}], translate: [{}] }, arm: { scale: [{}] } },
				slots: { body: { rgba: [{}], attachment: [{}] } },
				path: { rope: { position: [{}], mix: [{}] } },
				physics: { hair: { wind: [{}] }, "": { reset: [{}] } },
			},
		});
		expect(anim.timelines).toEqual({ ...none, bones: 3, slots: 2, path: 2, physics: 2 });
	});

	it("counts one timeline per ik and transform constraint", () => {
		const [anim] = parseAnimations({
			aim: { ik: { "arm-ik": [{}], "leg-ik": [{}] }, transform: { t1: [{}] } },
		});
		expect(anim.timelines).toEqual({ ...none, ik: 2, transform: 1 });
	});

	it("counts deform timelines in the 4.0 layout", () => {
		const [anim] = parseAnimations({
			hit: {
				deform: { default: { body: { body: [{}], cape: [{}] }, head: { head: [{}] } } },
			},
		});
		expect(anim.timelines.deform).toBe(3);
	});

	it("counts deform timelines in the 4.1+ layout and ignores sequence timelines", () => {
		const [anim] = parseAnimations({
			hit: {
				attachments: {
					default: { body: { body: { deform: [{}] }, blink: { sequence: [{}] } } },
					armor: { body: { plate: { deform: [{}], sequence: [{}] } } },
				},
			},
		});
		expect(anim.timelines.deform).toBe(2);
	});

	it("counts draw order as one timeline in either spelling", () => {
		const [camel, lower] = parseAnimations({
			a: { drawOrder: [{}, { time: 1 }] },
			b: { draworder: [{}] },
		});
		expect(camel.timelines.drawOrder).toBe(1);
		expect(lower.timelines.drawOrder).toBe(1);
	});

	it("lists each event it fires once, in order of first firing", () => {
		const [anim] = parseAnimations({
			walk: {
				events: [
					{ time: 0.1, name: "step" },
					{ time: 0.5, name: "breath" },
					{ time: 0.9, name: "step" },
					{ time: 1 },
				],
			},
		});
		expect(anim.events).toEqual(["step", "breath"]);
	});

	it("reports nothing for an empty animation and ignores fields of the wrong shape", () => {
		expect(parseAnimations({ pose: {}, odd: { bones: [1], events: "hit", ik: 3 } })).toEqual([
			{ name: "pose", duration: 0, timelines: none, events: [] },
			{ name: "odd", duration: 0, timelines: none, events: [] },
		]);
	});

	it("reads no animations from a value that is not an object", () => {
		expect(parseAnimations(undefined)).toEqual([]);
		expect(parseAnimations([{ bones: {} }])).toEqual([]);
	});
});
