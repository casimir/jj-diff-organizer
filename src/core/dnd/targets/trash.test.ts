import { describe, expect, it } from "vitest";

import { Slot } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { trashHandler } from "@/core/dnd/targets/trash";
import { HUNK_TOOL } from "@/core/jj";
import { change } from "@/fixtures";

const x = change("x");
const dragX: DragObject = { kind: "change", change: x };
const file: DragObject = { kind: "file", from: x, path: "src/a.ts", renamedFrom: null };
const hunk: DragObject = { kind: "hunk", from: x, path: "src/a.ts", digest: "d1" };

const commandOf = (object: DragObject, shift: boolean) => trashHandler(object, { slot: Slot.Onto, shift })?.command;
const argsOf = (object: DragObject, shift: boolean) => {
  const command = commandOf(object, shift);
  return command?.kind === "jj" ? command.args : null;
};

describe("trashHandler", () => {
  it("abandons a change, keeping its descendants' content with shift", () => {
    expect(argsOf(dragX, false)).toEqual(["abandon", "x"]);
    expect(argsOf(dragX, true)).toEqual(["abandon", "x", "--restore-descendants"]);
  });

  it("deletes a bookmark everywhere, or forgets it locally with shift", () => {
    const bookmark: DragObject = { kind: "bookmark", name: "main" };
    expect(argsOf(bookmark, false)).toEqual(["bookmark", "delete", "main"]);
    expect(argsOf(bookmark, true)).toEqual(["bookmark", "forget", "main"]);
  });

  it("restores a file, both names when renamed", () => {
    expect(argsOf(file, false)).toEqual(["restore", "--changes-in", "x", "src/a.ts"]);
    expect(argsOf({ ...file, path: "src/b.ts", renamedFrom: "src/a.ts" }, true)).toEqual([
      "restore", "--changes-in", "x", "--restore-descendants", "src/a.ts", "src/b.ts",
    ]);
  });

  it("reverts a hunk through the diff editor", () => {
    expect(argsOf(hunk, true)).toEqual([
      "diffedit", "-r", "x", "--tool", HUNK_TOOL, "--restore-descendants", "src/a.ts",
    ]);
    expect(commandOf(hunk, false)).toMatchObject({ hunk: { op: "revert", path: "src/a.ts", digest: "d1" } });
  });

  it("refuses the working copy label and immutable changes", () => {
    const immutable = change("m", { immutable: true });
    expect(argsOf({ kind: "wc", change: x }, false)).toBeNull();
    expect(argsOf({ kind: "change", change: immutable }, false)).toBeNull();
    expect(argsOf({ ...file, from: immutable }, false)).toBeNull();
    expect(argsOf({ ...hunk, from: immutable }, false)).toBeNull();
  });
});
