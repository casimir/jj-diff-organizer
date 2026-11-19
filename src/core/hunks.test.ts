import { describe, expect, it } from "vitest";

import { HunkState, hunkState, isCollapsed, pruneCollapseOverrides } from "@/core/hunks";
import { file } from "@/fixtures";

describe("hunkState", () => {
  it("flags an unreviewed hunk as changed when a marked hunk of its file no longer exists", () => {
    const edited = file("a.txt", ["d1", "d2-edited"]);
    const marks = { "a.txt": ["d1", "d2"] };
    expect(hunkState(edited, marks, "d1")).toBe(HunkState.Reviewed);
    expect(hunkState(edited, marks, "d2-edited")).toBe(HunkState.Changed);
  });

  it("leaves a never-reviewed file unreviewed", () => {
    expect(hunkState(file("a.txt", ["d1"]), {}, "d1")).toBe(HunkState.Unreviewed);
  });
});

describe("isCollapsed", () => {
  const reviewed = file("a.txt", ["d1"]);
  const marks = { "a.txt": ["d1"] };

  it("collapses a reviewed file by default, unless a toggle says otherwise or it is not reviewable", () => {
    expect(isCollapsed(reviewed, marks, {}, true)).toBe(true);
    expect(isCollapsed(reviewed, marks, { "a.txt": false }, true)).toBe(false);
    expect(isCollapsed(reviewed, marks, {}, false)).toBe(false);
  });
});

describe("pruneCollapseOverrides", () => {
  const before = { files: [file("a.txt", ["d1"]), file("b.txt", ["b1"])], marks: { "a.txt": ["d1"] } };

  it("keeps a toggle while the file's review state is unchanged", () => {
    expect(pruneCollapseOverrides({ "b.txt": true }, before, before)).toEqual({ "b.txt": true });
  });

  it("drops a toggle once the file changed since review or is gone", () => {
    const edited = { files: [file("a.txt", ["d1-edited"])], marks: before.marks };
    expect(pruneCollapseOverrides({ "a.txt": false, "b.txt": true }, before, edited)).toEqual({});
  });
});
