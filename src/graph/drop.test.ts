import { describe, expect, it } from "vitest";

import { displayCommand, dropArgs, HUNK_TOOL, Zone, zoneAt, type DragSource } from "@/graph/drop";
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
  const file: DragSource = { kind: "file", path: "src/a.ts" };
  const hunk: DragSource = { kind: "hunk", path: "src/a.ts", digest: "d1" };

  it("squashes a file whole and a hunk through the diff editor", () => {
    expect(dropArgs(file, y, Zone.Onto, false)).toEqual(["squash", "--into", "y", "--use-destination-message", "src/a.ts"]);
    expect(dropArgs(hunk, y, Zone.Onto, false)).toEqual([
      "squash", "--into", "y", "--use-destination-message", "--tool", HUNK_TOOL, "src/a.ts",
    ]);
  });

  it("quotes paths that jj would parse as fileset syntax", () => {
    expect(dropArgs({ kind: "file", path: 'my "dir"/a b.ts' }, y, Zone.Onto, false)).toEqual([
      "squash", "--into", "y", "--use-destination-message", 'root-file:"my \\"dir\\"/a b.ts"',
    ]);
  });

  it("refuses immutable targets and the working copy", () => {
    expect(dropArgs(file, change("m", { immutable: true }), Zone.Onto, false)).toBeNull();
    expect(dropArgs(hunk, change("w", { wc: true }), Zone.Onto, false)).toBeNull();
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
