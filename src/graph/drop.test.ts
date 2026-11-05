import { describe, expect, it } from "vitest";

import {
  changeEffect,
  displayCommand,
  dropActions,
  dropArgs,
  HUNK_TOOL,
  isDestructive,
  terminalEffect,
  trashArgs,
  trashEffect,
  Zone,
  zoneAt,
  type DragSource,
} from "@/graph/drop";
import type { Change } from "@/types";

function change(id: string, overrides: Partial<Change> = {}): Change {
  return {
    change_id: id,
    short: id,
    short_prefix: id,
    commit_id: id,
    parents: [],
    desc: id,
    bookmarks: [],
    unsynced_bookmarks: [],
    wc: false,
    immutable: false,
    empty: false,
    conflict: false,
    ...overrides,
  };
}

const x = change("x");
const y = change("y");
const dragX: DragSource = { kind: "change", change: x };

describe("dropArgs", () => {
  it("squashes a change into the middle of a row", () => {
    expect(dropArgs(dragX, y, Zone.Onto, false)).toEqual(["squash", "--from", "x", "--into", "y", "--use-destination-message"]);
  });

  it("rebases onto the target with shift on the middle of a row", () => {
    expect(dropArgs(dragX, y, Zone.Onto, true)).toEqual(["rebase", "--revisions", "x", "--onto", "y"]);
  });

  it("refuses squashing immutable changes", () => {
    expect(dropArgs(dragX, change("m", { immutable: true }), Zone.Onto, false)).toBeNull();
    expect(dropArgs({ kind: "change", change: change("m", { immutable: true }) }, y, Zone.Onto, false)).toBeNull();
  });

  it("rebases on the row edges", () => {
    expect(dropArgs(dragX, y, Zone.Above, false)).toEqual(["rebase", "--revisions", "x", "--insert-after", "y"]);
    expect(dropArgs(dragX, y, Zone.Below, false)).toEqual(["rebase", "--revisions", "x", "--insert-before", "y"]);
  });

  it("brings descendants along with shift on a rebase", () => {
    expect(dropArgs(dragX, y, Zone.Above, true)).toEqual(["rebase", "--source", "x", "--insert-after", "y"]);
  });

  it("allows backwards bookmark moves only with shift", () => {
    const bookmark: DragSource = { kind: "bookmark", name: "main" };
    expect(dropArgs(bookmark, y, Zone.Onto, false)).toEqual(["bookmark", "set", "main", "--revision", "y"]);
    expect(dropArgs(bookmark, y, Zone.Onto, true)).toEqual([
      "bookmark", "set", "main", "--revision", "y", "--allow-backwards",
    ]);
  });

  it("refuses drops that would change nothing", () => {
    expect(dropArgs(dragX, x, Zone.Onto, false)).toBeNull();
    expect(dropArgs({ kind: "bookmark", name: "main" }, change("z", { bookmarks: ["main"] }), Zone.Onto, false)).toBeNull();
    expect(dropArgs({ kind: "wc", change: x }, x, Zone.Onto, false)).toBeNull();
  });

  it("edits the target when dragging the working copy label", () => {
    expect(dropArgs({ kind: "wc", change: x }, y, Zone.Above, true)).toEqual(["edit", "y"]);
  });
});

describe("dropArgs for review items", () => {
  const file: DragSource = { kind: "file", from: x, path: "src/a.ts", renamedFrom: null };
  const hunk: DragSource = { kind: "hunk", from: x, path: "src/a.ts", digest: "d1" };

  it("squashes a file whole and a hunk through the diff editor", () => {
    expect(dropArgs(file, y, Zone.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", "src/a.ts",
    ]);
    expect(dropArgs(hunk, y, Zone.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", "--tool", HUNK_TOOL, "src/a.ts",
    ]);
  });

  it("squashes a renamed file under both names so the rename moves whole", () => {
    const renamed: DragSource = { kind: "file", from: x, path: "src/b.ts", renamedFrom: "src/a.ts" };
    expect(dropArgs(renamed, y, Zone.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", "src/a.ts", "src/b.ts",
    ]);
  });

  it("quotes paths that jj would parse as fileset syntax", () => {
    expect(dropArgs({ kind: "file", from: x, path: 'my "dir"/a b.ts', renamedFrom: null }, y, Zone.Onto, false)).toEqual([
      "squash", "--from", "x", "--into", "y", "--use-destination-message", 'root-file:"my \\"dir\\"/a b.ts"',
    ]);
  });

  it("moves into the working copy from another change", () => {
    expect(dropArgs(hunk, change("w", { wc: true }), Zone.Onto, false)).not.toBeNull();
  });

  it("refuses its own change and immutable sources or targets", () => {
    expect(dropArgs(file, x, Zone.Onto, false)).toBeNull();
    expect(dropArgs(file, change("m", { immutable: true }), Zone.Onto, false)).toBeNull();
    expect(dropArgs({ ...hunk, from: change("m", { immutable: true }) }, y, Zone.Onto, false)).toBeNull();
  });
});

describe("trashArgs", () => {
  const file: DragSource = { kind: "file", from: x, path: "src/a.ts", renamedFrom: null };
  const hunk: DragSource = { kind: "hunk", from: x, path: "src/a.ts", digest: "d1" };

  it("abandons a change, keeping its descendants' content with shift", () => {
    expect(trashArgs(dragX, false)).toEqual(["abandon", "x"]);
    expect(trashArgs(dragX, true)).toEqual(["abandon", "x", "--restore-descendants"]);
  });

  it("deletes a bookmark everywhere, or forgets it locally with shift", () => {
    const bookmark: DragSource = { kind: "bookmark", name: "main" };
    expect(trashArgs(bookmark, false)).toEqual(["bookmark", "delete", "main"]);
    expect(trashArgs(bookmark, true)).toEqual(["bookmark", "forget", "main"]);
  });

  it("restores a file, both names when renamed", () => {
    expect(trashArgs(file, false)).toEqual(["restore", "--changes-in", "x", "src/a.ts"]);
    expect(trashArgs({ ...file, path: "src/b.ts", renamedFrom: "src/a.ts" }, true)).toEqual([
      "restore", "--changes-in", "x", "--restore-descendants", "src/a.ts", "src/b.ts",
    ]);
  });

  it("reverts a hunk through the diff editor", () => {
    expect(trashArgs(hunk, true)).toEqual([
      "diffedit", "-r", "x", "--tool", HUNK_TOOL, "--restore-descendants", "src/a.ts",
    ]);
  });

  it("refuses the working copy label and immutable changes", () => {
    const immutable = change("m", { immutable: true });
    expect(trashArgs({ kind: "wc", change: x }, false)).toBeNull();
    expect(trashArgs({ kind: "change", change: immutable }, false)).toBeNull();
    expect(trashArgs({ ...file, from: immutable }, false)).toBeNull();
    expect(trashArgs({ ...hunk, from: immutable }, false)).toBeNull();
  });
});

describe("hunk operation of an effect", () => {
  const hunk: DragSource = { kind: "hunk", from: x, path: "src/a.ts", digest: "d1" };
  const ctx = { zone: Zone.Onto, shift: false };

  it("keeps the hunk when squashing it and reverts it when trashing it", () => {
    expect(changeEffect(y)(hunk, ctx)).toMatchObject({ hunk: { op: "keep", path: "src/a.ts", digest: "d1" } });
    expect(trashEffect(hunk, ctx)).toMatchObject({ hunk: { op: "revert", path: "src/a.ts", digest: "d1" } });
  });
});

describe("dropActions", () => {
  it("lists what a target does with the source, whatever the zone or shift state", () => {
    expect(dropActions(changeEffect(y), dragX)).not.toHaveLength(0);
    expect(dropActions(changeEffect(change("m", { immutable: true })), dragX)).not.toHaveLength(0);
  });

  it("is empty when no context accepts the source", () => {
    expect(dropActions(changeEffect(x), dragX)).toEqual([]);
    expect(dropActions(terminalEffect, { kind: "hunk", from: x, path: "a", digest: "d" })).toEqual([]);
  });

  it("flags only the trash as destructive", () => {
    expect(dropActions(trashEffect, dragX).every(isDestructive)).toBe(true);
    expect(dropActions(changeEffect(y), dragX).some(isDestructive)).toBe(false);
  });
});

describe("terminalEffect", () => {
  const ctx = { zone: Zone.Onto, shift: false };
  const insert = (source: DragSource) => terminalEffect(source, ctx);
  const file = (path: string): DragSource => ({ kind: "file", from: x, path, renamedFrom: null });

  it("inserts paths, quoting only when needed", () => {
    expect(insert(file("src/a.ts"))).toEqual({ kind: "insert", text: "src/a.ts" });
    expect(insert(file("my docs/it's.md"))).toEqual({ kind: "insert", text: "'my docs/it'\\''s.md'" });
  });

  it("inserts a change id and a bookmark name", () => {
    expect(insert(dragX)).toEqual({ kind: "insert", text: "x" });
    expect(insert({ kind: "bookmark", name: "feature/x" })).toEqual({ kind: "insert", text: "feature/x" });
    expect(insert({ kind: "bookmark", name: "a*b" })).toEqual({ kind: "insert", text: "'a*b'" });
  });

  it("ignores sources it does not accept", () => {
    expect(insert({ kind: "wc", change: x })).toBeNull();
  });
});

describe("zoneAt", () => {
  it("splits a row into top edge, middle and bottom edge", () => {
    expect(zoneAt(101, 100, 28)).toBe(Zone.Above);
    expect(zoneAt(114, 100, 28)).toBe(Zone.Onto);
    expect(zoneAt(127, 100, 28)).toBe(Zone.Below);
  });
});

describe("displayCommand", () => {
  it("quotes like the Rust display_command", () => {
    expect(displayCommand(["bookmark", "set", "it's here", "--revision", "y"])).toBe(
      `jj bookmark set 'it'\\''s here' --revision y`,
    );
  });
});
