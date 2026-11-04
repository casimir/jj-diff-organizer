import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/api";
import type { Change } from "@/types";

import { useGraphStore } from "./graph";

vi.mock("@/api");

const change = (id: string): Change => ({
  change_id: id,
  short: id,
  short_prefix: id,
  commit_id: `commit-${id}`,
  parents: [],
  desc: "",
  bookmarks: [],
  unsynced_bookmarks: [],
  wc: false,
  immutable: false,
  empty: false,
  conflict: false,
});

const gone = new Error("Revision `x` doesn't exist");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.errorMessage).mockImplementation((e) => (e as Error).message);
  vi.mocked(api.marks).mockResolvedValue({});
  vi.mocked(api.show).mockImplementation(async (id) => {
    if (id === "x") throw gone;
    return [];
  });
  useGraphStore.setState({ revset: "all()", changes: [change("x"), change("y")], selectedId: "x", error: null });
});

describe("refresh when the selected change left the graph", () => {
  it("follows the single successor and shows no error", async () => {
    vi.mocked(api.graph).mockResolvedValue([change("y")]);
    vi.mocked(api.successors).mockResolvedValue(["y"]);

    await useGraphStore.getState().refresh();

    const s = useGraphStore.getState();
    expect(api.successors).toHaveBeenCalledWith("all()", "x");
    expect(s.selectedId).toBe("y");
    expect(s.detailsError).toBeNull();
  });

  it.each([[[]], [["y", "z"]]])("unselects without an error when successors are %j", async (ids) => {
    vi.mocked(api.graph).mockResolvedValue([change("y")]);
    vi.mocked(api.successors).mockResolvedValue(ids);

    await useGraphStore.getState().refresh();

    const s = useGraphStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.detailsError).toBeNull();
    expect(s.error).toBeNull();
  });

  it("unselects and reports it when the successor query fails", async () => {
    vi.mocked(api.graph).mockResolvedValue([change("y")]);
    vi.mocked(api.successors).mockRejectedValue(new Error("jj broke"));

    await useGraphStore.getState().refresh();

    const s = useGraphStore.getState();
    expect(s.selectedId).toBeNull();
    expect(s.error).toBe("jj broke");
  });
});

describe("refresh when the selected change is still in the graph", () => {
  it("keeps the selection and shows a real load failure", async () => {
    vi.mocked(api.graph).mockResolvedValue([change("x")]);

    await useGraphStore.getState().refresh();

    const s = useGraphStore.getState();
    expect(api.successors).not.toHaveBeenCalled();
    expect(s.selectedId).toBe("x");
    expect(s.detailsError).toBe(gone.message);
  });
});
