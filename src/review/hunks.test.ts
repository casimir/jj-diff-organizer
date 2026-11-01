import { describe, expect, it } from "vitest";

import { HunkState, hunkState, nextHunk } from "@/review/hunks";
import { FileStatus, type FileView } from "@/types";

function file(path: string, digests: string[]): FileView {
  return { path, status: FileStatus.Modified, binary: false, digests, lines: [] };
}

describe("hunkState", () => {
  it("flags an unreviewed hunk as changed when a marked hunk of its file no longer exists", () => {
    const edited = file("a.txt", ["d1", "d2-edited"]);
    const marks = { "a.txt": ["d1", "d2"] };
    expect(hunkState(edited, marks, 0)).toBe(HunkState.Reviewed);
    expect(hunkState(edited, marks, 1)).toBe(HunkState.Changed);
  });

  it("leaves a never-reviewed file unreviewed", () => {
    expect(hunkState(file("a.txt", ["d1"]), {}, 0)).toBe(HunkState.Unreviewed);
  });
});

describe("nextHunk", () => {
  const files = [file("a.txt", ["a1", "a2"]), file("b.txt", ["b1"])];
  const marks = { "a.txt": ["a1", "a2"] };
  const unreviewed = (s: HunkState) => s !== HunkState.Reviewed;

  it("skips reviewed hunks across files and wraps around", () => {
    expect(nextHunk(files, marks, { path: "a.txt", group: 0 }, 1, unreviewed)).toEqual({ path: "b.txt", group: 0 });
    expect(nextHunk(files, marks, { path: "b.txt", group: 0 }, 1, unreviewed)).toEqual({ path: "b.txt", group: 0 });
  });

  it("walks backwards from nothing to the last hunk", () => {
    expect(nextHunk(files, {}, null, -1)).toEqual({ path: "b.txt", group: 0 });
  });

  it("finds nothing when every hunk is reviewed", () => {
    expect(nextHunk(files, { "a.txt": ["a1", "a2"], "b.txt": ["b1"] }, null, 1, unreviewed)).toBeNull();
  });
});
