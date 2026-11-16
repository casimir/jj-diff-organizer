import { describe, expect, it } from "vitest";

import { accepts, Slot, slotAt } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { rowHandler } from "@/core/dnd/targets/row";
import { terminalHandler } from "@/core/dnd/targets/terminal";
import { change } from "@/fixtures";

const x = change("x");
const y = change("y");
const dragX: DragObject = { kind: "change", change: x };

describe("slotAt", () => {
  it("splits a row into top edge, middle and bottom edge", () => {
    expect(slotAt(101, 100, 28)).toBe(Slot.Above);
    expect(slotAt(114, 100, 28)).toBe(Slot.Onto);
    expect(slotAt(127, 100, 28)).toBe(Slot.Below);
  });
});

describe("accepts", () => {
  it("is true when any slot or shift state accepts the object", () => {
    expect(accepts(rowHandler(y), dragX)).toBe(true);
    expect(accepts(rowHandler(change("m", { immutable: true })), dragX)).toBe(true);
  });

  it("is false when no context accepts the object", () => {
    expect(accepts(rowHandler(x), dragX)).toBe(false);
    expect(accepts(terminalHandler, { kind: "hunk", from: x, path: "a", digest: "d" })).toBe(false);
  });
});
