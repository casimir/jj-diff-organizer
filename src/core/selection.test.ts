import { describe, expect, it } from "vitest";

import { HunkState } from "@/core/hunks";
import { fit, moveFile, nextHunk, scrolled, type Data, type Selection } from "@/core/selection";
import { file } from "@/fixtures";
import type { FileView } from "@/types";

const data = (files: FileView[], collapse: Record<string, boolean> = {}, marks: Data["marks"] = {}): Data => ({
  files,
  marks,
  collapse,
  reviewable: true,
});

describe("fit", () => {
  const files = [file("a.txt", ["a1", "a2"]), file("b.txt", ["b1"]), file("c.txt", [])];
  const on = (path: string, hunk?: string): Selection => ({ change: "x", file: { path, hunk } });

  it("keeps a selection that still points at something", () => {
    expect(fit(on("a.txt", "a2"), data(files))).toEqual(on("a.txt", "a2"));
  });

  it("falls back to the first hunk of the file once its hunk is gone, or the file is expanded", () => {
    expect(fit(on("a.txt", "gone"), data(files))).toEqual(on("a.txt", "a1"));
    expect(fit(on("a.txt"), data(files))).toEqual(on("a.txt", "a1"));
  });

  it("rests on the file itself when it is collapsed or has no hunks", () => {
    expect(fit(on("a.txt", "a1"), data(files, { "a.txt": true }))).toEqual(on("a.txt"));
    expect(fit(on("c.txt"), data(files))).toEqual(on("c.txt"));
  });

  it("falls back to the first file once its file is gone, and to the change alone without files", () => {
    expect(fit(on("gone.txt", "a2"), data(files))).toEqual(on("a.txt", "a1"));
    expect(fit(on("a.txt", "a1"), data([]))).toEqual({ change: "x" });
  });
});

describe("moveFile", () => {
  const files = [file("a.txt", ["a1"]), file("b.txt", ["b1"])];

  it("lands on the header of a collapsed file and on the first hunk of an expanded one", () => {
    const from: Selection = { change: "x", file: { path: "a.txt", hunk: "a1" } };
    expect(moveFile(from, data(files, { "b.txt": true }), 1).file).toEqual({ path: "b.txt" });
    expect(moveFile(from, data(files), 1).file).toEqual({ path: "b.txt", hunk: "b1" });
  });
});

describe("scrolled", () => {
  const files = [file("a.txt", ["a1", "a2", "a3"])];
  const from: Selection = { change: "x", file: { path: "a.txt", hunk: "a2" } };
  const leaf = (hunk: string) => ({ path: "a.txt", hunk });

  it("keeps a selection that is still visible", () => {
    expect(scrolled(from, data(files), [leaf("a1"), leaf("a2")])).toBe(from);
  });

  it("moves a selection that left through the top to the first visible leaf", () => {
    expect(scrolled(from, data(files), [leaf("a3")]).file).toEqual(leaf("a3"));
  });

  it("moves a selection that left through the bottom to the last visible leaf", () => {
    expect(scrolled(from, data(files), [leaf("a1")]).file).toEqual(leaf("a1"));
  });
});

describe("nextHunk", () => {
  const files = [file("a.txt", ["a1", "a2"]), file("b.txt", ["b1"])];
  const marks = { "a.txt": ["a1", "a2"] };
  const unreviewed = (s: HunkState) => s !== HunkState.Reviewed;

  it("skips reviewed hunks across files and wraps around", () => {
    expect(nextHunk(files, marks, { path: "a.txt", hunk: "a1" }, 1, { wanted: unreviewed })).toEqual({ path: "b.txt", hunk: "b1" });
    expect(nextHunk(files, marks, { path: "b.txt", hunk: "b1" }, 1, { wanted: unreviewed })).toEqual({ path: "b.txt", hunk: "b1" });
  });

  it("walks backwards from nothing to the last hunk", () => {
    expect(nextHunk(files, {}, undefined, -1)).toEqual({ path: "b.txt", hunk: "b1" });
  });

  it("passes over the hunks of skipped files", () => {
    const skip = (f: FileView) => f.path === "b.txt";
    expect(nextHunk(files, {}, { path: "a.txt", hunk: "a2" }, 1, { skip })).toEqual({ path: "a.txt", hunk: "a1" });
    expect(nextHunk(files, {}, { path: "a.txt", hunk: "a1" }, -1, { skip })).toEqual({ path: "a.txt", hunk: "a2" });
  });

  it("leaves a selected file towards the neighbouring files", () => {
    const from = { path: "b.txt" };
    expect(nextHunk(files, {}, from, 1, { skip: (f) => f.path === "b.txt" })).toEqual({ path: "a.txt", hunk: "a1" });
    expect(nextHunk(files, {}, from, -1)).toEqual({ path: "a.txt", hunk: "a2" });
  });

  it("finds nothing when every hunk is reviewed", () => {
    expect(nextHunk(files, { "a.txt": ["a1", "a2"], "b.txt": ["b1"] }, undefined, 1, { wanted: unreviewed })).toBeNull();
  });
});
