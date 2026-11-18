import { describe, expect, it } from "vitest";
import { extentTicks } from "./ticks";

describe("extentTicks", () => {
  it("labels the minimum and the maximum of the finite values", () =>
    expect(extentTicks([0.2, null, 0.9, NaN, 0.5])).toEqual([0.2, 0.9]));
  it("labels a single value once", () => expect(extentTicks([3, 3])).toEqual([3]));
  it("is empty without values", () => expect(extentTicks([null])).toEqual([]));
});
