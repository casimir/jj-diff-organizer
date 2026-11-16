import { describe, expect, it } from "vitest";

import { Slot } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { rowHandler } from "@/core/dnd/targets/row";
import { HUNK_TOOL } from "@/core/jj";
import { change } from "@/fixtures";
import type { Change } from "@/types";

const x = change("x");
const y = change("y");
const dragX: DragObject = { kind: "change", change: x };

const outcomeOf = (object: DragObject, target: Change, slot: Slot, shift: boolean) =>
  rowHandler(target)(object, { slot, shift });
const argsOf = (object: DragObject, target: Change, slot: Slot, shift: boolean) => {
  const command = outcomeOf(object, target, slot, shift)?.command;
  return command?.kind === "jj" ? command.args : null;
};

describe("rowHandler slot", () => {
  const file: DragObject = { kind: "file", from: x, path: "a.ts", renamedFrom: null };

  it("keeps the pointer's slot for objects that insert above or below", () => {
    expect(outcomeOf(dragX, y, Slot.Above, false)?.slot).toBe(Slot.Above);
    expect(outcomeOf(file, y, Slot.Below, false)?.slot).toBe(Slot.Below);
  });

  it("lands onto the row for objects that ignore the slot", () => {
    expect(outcomeOf({ kind: "bookmark", name: "b" }, y, Slot.Above, false)?.slot).toBe(Slot.Onto);
    expect(outcomeOf({ kind: "wc", change: x }, y, Slot.Below, false)?.slot).toBe(Slot.Onto);
  });
});

describe("rowHandler", () => {
  it("squashes a change into the middle of a row", () => {
    expect(argsOf(dragX, y, Slot.Onto, false)).toEqual(["squash", "--from", "x", "--into", "y", "--use-destination-message"]);
  });

  it("rebases onto the target with shift on the middle of a row", () => {
    expect(argsOf(dragX, y, Slot.Onto, true)).toEqual(["rebase", "--revisions", "x", "--onto", "y"]);
  });

  it("refuses squashing immutable changes", () => {
    expect(argsOf(dragX, change("m", { immutable: true }), Slot.Onto, false)).toBeNull();
    expect(argsOf({ kind: "change", change: change("m", { immutable: true }) }, y, Slot.Onto, false)).toBeNull();
  });

  it("rebases on the row edges", () => {
    expect(argsOf(dragX, y, Slot.Above, false)).toEqual(["rebase", "--revisions", "x", "--insert-after", "y"]);
    expect(argsOf(dragX, y, Slot.Below, false)).toEqual(["rebase", "--revisions", "x", "--insert-before", "y"]);
  });

  it("brings descendants along with shift on a rebase", () => {
    expect(argsOf(dragX, y, Slot.Above, true)).toEqual(["rebase", "--source", "x", "--insert-after", "y"]);
  });

  it("allows backwards bookmark moves only with shift", () => {
    const bookmark: DragObject = { kind: "bookmark", name: "main" };
    expect(argsOf(bookmark, y, Slot.Onto, false)).toEqual(["bookmark", "set", "main", "--revision", "y"]);
    expect(argsOf(bookmark, y, Slot.Onto, true)).toEqual([
      "bookmark", "set", "main", "--revision", "y", "--allow-backwards",
    ]);
  });

  it("refuses drops that would change nothing", () => {
    expect(argsOf(dragX, x, Slot.Onto, false)).toBeNull();
    expect(argsOf({ kind: "bookmark", name: "main" }, change("z", { bookmarks: ["main"] }), Slot.Onto, false)).toBeNull();
    expect(argsOf({ kind: "wc", change: x }, x, Slot.Onto, false)).toBeNull();
  });

  it("edits the target when dragging the working copy label", () => {
    expect(argsOf({ kind: "wc", change: x }, y, Slot.Above, true)).toEqual(["edit", "y"]);
  });
});

describe("rowHandler for review items", () => {
  const file: DragObject = { kind: "file", from: x, path: "src/a.ts", renamedFrom: null };
  const hunk: DragObject = { kind: "hunk", from: x, path: "src/a.ts", digest: "d1" };

  it("squashes a file whole and a hunk through the diff editor", () => {
    expect(argsOf(file, y, Slot.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", "src/a.ts",
    ]);
    expect(argsOf(hunk, y, Slot.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", "--tool", HUNK_TOOL, "src/a.ts",
    ]);
  });

  it("keeps the hunk it squashes", () => {
    expect(outcomeOf(hunk, y, Slot.Onto, false)?.command).toMatchObject({
      hunk: { op: "keep", path: "src/a.ts", digest: "d1" },
    });
  });

  it("squashes a renamed file under both names so the rename moves whole", () => {
    const renamed: DragObject = { kind: "file", from: x, path: "src/b.ts", renamedFrom: "src/a.ts" };
    expect(argsOf(renamed, y, Slot.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", "src/a.ts", "src/b.ts",
    ]);
  });

  it("quotes paths that jj would parse as fileset syntax", () => {
    expect(argsOf({ kind: "file", from: x, path: 'my "dir"/a b.ts', renamedFrom: null }, y, Slot.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", 'root-file:"my \\"dir\\"/a b.ts"',
    ]);
  });

  it("moves a file or hunk into a new change next to the target on its edges", () => {
    expect(argsOf(file, y, Slot.Above, false)).toEqual([
      "squash", "--from", "x", "--insert-after", "y", "src/a.ts",
    ]);
    expect(argsOf(hunk, y, Slot.Below, false)).toEqual([
      "squash", "--from", "x", "--insert-before", "y", "--tool", HUNK_TOOL, "src/a.ts",
    ]);
  });

  it("splits a file or hunk out of its own change on the edges, not onto it", () => {
    expect(argsOf(file, x, Slot.Above, false)).toEqual(["squash", "--from", "x", "--insert-after", "x", "src/a.ts"]);
    expect(argsOf(hunk, x, Slot.Below, false)).not.toBeNull();
    expect(argsOf(file, x, Slot.Onto, false)).toBeNull();
  });

  it("inserts above an immutable target but never below it", () => {
    const immutable = change("m", { immutable: true });
    expect(argsOf(file, immutable, Slot.Above, false)).not.toBeNull();
    expect(argsOf(file, immutable, Slot.Below, false)).toBeNull();
  });

  it("moves into the working copy from another change", () => {
    expect(argsOf(hunk, change("w", { wc: true }), Slot.Onto, false)).not.toBeNull();
  });

  it("refuses its own change and immutable objects or targets", () => {
    expect(argsOf(file, x, Slot.Onto, false)).toBeNull();
    expect(argsOf(file, change("m", { immutable: true }), Slot.Onto, false)).toBeNull();
    expect(argsOf({ ...hunk, from: change("m", { immutable: true }) }, y, Slot.Onto, false)).toBeNull();
  });
});
