import { describe, expect, it } from "vitest";

import { HunkState, fileState, filesState, hunkState, isCollapsed, needsReview, pruneCollapseOverrides } from "@/core/hunks";
import { file } from "@/fixtures";
import { FileStatus } from "@/types";

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

describe("fileState and filesState", () => {
  const a = file("a.txt", ["a1", "a2"]);
  const b = file("b.txt", ["b1"]);

  it("is unreviewed until every file is reviewed, and changed when any file is", () => {
    expect(fileState(a, { "a.txt": ["a1"] })).toBe(HunkState.Unreviewed);
    expect(filesState([a, b], { "a.txt": ["a1", "a2"] })).toBe(HunkState.Unreviewed);
    expect(filesState([a, b], {})).toBe(HunkState.Unreviewed);
    expect(filesState([a, b], { "a.txt": ["a1", "a2"], "b.txt": ["b1"] })).toBe(HunkState.Reviewed);
    expect(filesState([a, file("b.txt", ["b1-edited"])], { "b.txt": ["b1"] })).toBe(HunkState.Changed);
  });

  it("ignores files without hunks", () => {
    const renamed = file("new.txt", [], { status: FileStatus.Renamed, old_path: "old.txt" });
    expect(filesState([renamed], {})).toBeNull();
    expect(filesState([renamed, b], { "b.txt": ["b1"] })).toBe(HunkState.Reviewed);
  });
});

describe("needsReview", () => {
  const files = [file("a.txt", ["a1"]), file("b.txt", ["b1"])];

  it("marks while any hunk is unreviewed and clears once all are reviewed", () => {
    expect(needsReview(files, { "a.txt": ["a1"] })).toBe(true);
    expect(needsReview(files, { "a.txt": ["a1"], "b.txt": ["b1"] })).toBe(false);
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

  it("collapses a generated file by default, reviewable or not, unless a toggle says otherwise", () => {
    const lock = file("Cargo.lock", ["d1"], { generated: true });
    expect(isCollapsed(lock, {}, {}, true)).toBe(true);
    expect(isCollapsed(lock, {}, {}, false)).toBe(true);
    expect(isCollapsed(lock, {}, { "Cargo.lock": false }, true)).toBe(false);
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
