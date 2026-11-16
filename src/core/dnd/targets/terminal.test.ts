import { describe, expect, it } from "vitest";

import { Slot } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { terminalHandler } from "@/core/dnd/targets/terminal";
import { change } from "@/fixtures";

const x = change("x");
const ctx = { slot: Slot.Onto, shift: false };
const insert = (object: DragObject) => terminalHandler(object, ctx)?.command;
const file = (path: string): DragObject => ({ kind: "file", from: x, path, renamedFrom: null });

describe("terminalHandler", () => {
  it("inserts paths, quoting only when needed", () => {
    expect(insert(file("src/a.ts"))).toEqual({ kind: "insert", text: "src/a.ts" });
    expect(insert(file("my docs/it's.md"))).toEqual({ kind: "insert", text: "'my docs/it'\\''s.md'" });
  });

  it("inserts a change id and a bookmark name", () => {
    expect(insert({ kind: "change", change: x })).toEqual({ kind: "insert", text: "x" });
    expect(insert({ kind: "bookmark", name: "feature/x" })).toEqual({ kind: "insert", text: "feature/x" });
    expect(insert({ kind: "bookmark", name: "a*b" })).toEqual({ kind: "insert", text: "'a*b'" });
  });

  it("ignores objects it does not accept", () => {
    expect(terminalHandler({ kind: "wc", change: x }, ctx)).toBeNull();
  });
});
