import { describe, expect, it } from "vitest";

import { layoutGraph } from "@/graph/layout";
import type { Change } from "@/types";

function change(id: string, parents: string[]): Change {
  return {
    change_id: id,
    short: id,
    commit_id: id,
    parents,
    desc: id,
    bookmarks: [],
    wc: false,
    immutable: false,
    empty: false,
    conflict: false,
  };
}

describe("layoutGraph", () => {
  it("puts sibling branches in separate lanes and joins the second one into its parent's lane", () => {
    const { rows, laneCount } = layoutGraph([
      change("a", ["base"]),
      change("b", ["base"]),
      change("base", []),
    ]);

    expect(rows.map((r) => r.col)).toEqual([0, 1, 0]);
    expect(rows[1].parentLanes).toEqual([0]);
    expect(rows[2].before).toEqual(["base"]);
    expect(laneCount).toBe(2);
  });

  it("marks a change whose parent is outside the revset as elided instead of reserving a lane", () => {
    const { rows } = layoutGraph([change("a", ["outside"]), change("b", [])]);

    expect(rows[0].elided).toBe(true);
    expect(rows[0].parentLanes).toEqual([]);
    expect(rows[1].col).toBe(0);
  });
});
