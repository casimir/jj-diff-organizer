import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/api";
import { change, file } from "@/fixtures";
import type { FileView, Marks } from "@/types";

import { useDiffStore } from "./diff";
import { useGraphStore } from "./graph";
import { useSelectionStore } from "./selection";

vi.mock("@/api");

const selection = () => useSelectionStore.getState();
const leaf = () => selection().selection?.file;

const open = async (changeId: string, files: FileView[], marks: Marks = {}) => {
  vi.mocked(api.show).mockResolvedValue(files);
  vi.mocked(api.marks).mockResolvedValue(marks);
  selection().selectChange(changeId);
  await vi.waitFor(() => expect(useDiffStore.getState().loadedId).toBe(changeId));
};

beforeEach(() => {
  vi.resetAllMocks();
  useSelectionStore.setState({ selection: null, remembered: {}, reveal: null });
  useDiffStore.getState().load(null);
  useGraphStore.setState({ revset: "all()", changes: [change("x"), change("y")], error: null });
});

describe("selecting a change", () => {
  it("lands on the first hunk once its diff is loaded", async () => {
    await open("x", [file("a.txt", ["a1", "a2"])]);

    expect(selection().selection).toEqual({ change: "x", file: { path: "a.txt", hunk: "a1" } });
  });

  it("restores the selection a change had when it comes back", async () => {
    await open("x", [file("a.txt", ["a1", "a2"])]);
    selection().selectHunk("a.txt", "a2");

    await open("y", [file("b.txt", ["b1"])]);
    expect(leaf()).toEqual({ path: "b.txt", hunk: "b1" });

    await open("x", [file("a.txt", ["a1", "a2"])]);
    expect(leaf()).toEqual({ path: "a.txt", hunk: "a2" });
  });
});

describe("when the selected change left the graph", () => {
  beforeEach(() => open("x", [file("a.txt", ["a1"])]));

  it("follows the single successor", async () => {
    vi.mocked(api.graph).mockResolvedValue([change("y")]);
    vi.mocked(api.successors).mockResolvedValue(["y"]);

    await useGraphStore.getState().refresh();

    await vi.waitFor(() => expect(selection().selection?.change).toBe("y"));
    expect(api.successors).toHaveBeenCalledWith("all()", "x");
  });

  it.each([[[]], [["y", "z"]]])("selects nothing without an error when successors are %j", async (ids) => {
    vi.mocked(api.graph).mockResolvedValue([change("y")]);
    vi.mocked(api.successors).mockResolvedValue(ids);

    await useGraphStore.getState().refresh();

    await vi.waitFor(() => expect(selection().selection).toBeNull());
    expect(useGraphStore.getState().error).toBeNull();
    expect(useDiffStore.getState().files).toEqual([]);
  });

  it("selects nothing and reports it when the successor query fails", async () => {
    vi.mocked(api.graph).mockResolvedValue([change("y")]);
    vi.mocked(api.successors).mockRejectedValue(new Error("jj broke"));

    await useGraphStore.getState().refresh();

    await vi.waitFor(() => expect(selection().selection).toBeNull());
    expect(useGraphStore.getState().error).toBe("jj broke");
  });

  it("keeps the selection while the change is still in the graph", async () => {
    vi.mocked(api.graph).mockResolvedValue([change("x")]);

    await useGraphStore.getState().refresh();

    expect(api.successors).not.toHaveBeenCalled();
    expect(selection().selection?.change).toBe("x");
  });
});

describe("moving through the diff", () => {
  const files = [file("a.txt", ["a1", "a2"]), file("b.txt", ["b1"])];

  it("steps over a collapsed file and rests on its header when selected", async () => {
    await open("x", files);
    useDiffStore.getState().setCollapsed("b.txt", true);
    selection().selectHunk("a.txt", "a2");

    selection().moveHunk(1, false);
    expect(leaf()).toEqual({ path: "a.txt", hunk: "a1" });

    selection().moveFile(1);
    expect(leaf()).toEqual({ path: "b.txt" });
  });

  it("expands the collapsed file holding the next unreviewed hunk", async () => {
    await open("x", files, { "a.txt": ["a1", "a2"] });
    useDiffStore.getState().setCollapsed("b.txt", true);
    selection().selectHunk("a.txt", "a2");

    selection().moveHunk(1, true);

    expect(leaf()).toEqual({ path: "b.txt", hunk: "b1" });
    expect(useDiffStore.getState().collapse["b.txt"]).toBe(false);
  });

  it("moves between a hunk and the header as its file collapses and expands", async () => {
    await open("x", files);
    selection().selectHunk("a.txt", "a2");

    selection().toggleCollapse("a.txt");
    expect(leaf()).toEqual({ path: "a.txt" });

    selection().toggleCollapse("a.txt");
    expect(leaf()).toEqual({ path: "a.txt", hunk: "a1" });
  });

  it("selects and expands a clicked file, and does nothing when it is already selected", async () => {
    await open("x", files);
    useDiffStore.getState().setCollapsed("b.txt", true);

    selection().clickFile("b.txt");
    expect(leaf()).toEqual({ path: "b.txt", hunk: "b1" });
    expect(useDiffStore.getState().collapse["b.txt"]).toBe(false);

    useDiffStore.getState().setCollapsed("b.txt", true);
    selection().clickFile("b.txt");
    expect(leaf()).toEqual({ path: "b.txt" });
    expect(useDiffStore.getState().collapse["b.txt"]).toBe(true);
  });
});

describe("reloading the diff", () => {
  const reload = async (keys: string[]) => {
    vi.mocked(api.show).mockResolvedValue([file("a.txt", keys)]);
    await useDiffStore.getState().refresh();
  };

  it("keeps the selected hunk while it exists and falls back to the file's first hunk once it is gone", async () => {
    await open("x", [file("a.txt", ["d1", "d2"])]);
    selection().selectHunk("a.txt", "d2");

    await reload(["new", "d1", "d2"]);
    expect(leaf()).toEqual({ path: "a.txt", hunk: "d2" });

    await reload(["new", "d1", "d2-edited"]);
    expect(leaf()).toEqual({ path: "a.txt", hunk: "new" });
  });
});
