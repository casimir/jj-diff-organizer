import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "@/api";
import { file } from "@/fixtures";

import { useDiffStore } from "./diff";

vi.mock("@/api");

const gone = new Error("Revision `x` doesn't exist");

beforeEach(() => {
  vi.resetAllMocks();
  useDiffStore.getState().load(null);
});

describe("loading a change", () => {
  it("drops the previous change's diff state and loads the new one", async () => {
    vi.mocked(api.show).mockResolvedValue([file("a.txt", ["d1"])]);
    vi.mocked(api.marks).mockResolvedValue({ "a.txt": ["d1"] });
    useDiffStore.getState().load("x");
    await vi.waitFor(() => expect(useDiffStore.getState().loadedId).toBe("x"));
    useDiffStore.getState().setCollapsed("a.txt", false);

    vi.mocked(api.show).mockResolvedValue([file("b.txt", ["d2"])]);
    vi.mocked(api.marks).mockResolvedValue({});
    useDiffStore.getState().load("y");

    expect(useDiffStore.getState()).toMatchObject({ loadedId: null, files: [], marks: {}, collapse: {} });
    await vi.waitFor(() => expect(useDiffStore.getState().loadedId).toBe("y"));
    expect(api.show).toHaveBeenLastCalledWith("y");
  });

  it("shows a real load failure", async () => {
    vi.mocked(api.marks).mockResolvedValue({});
    vi.mocked(api.show).mockRejectedValue(gone);

    useDiffStore.getState().load("x");

    await vi.waitFor(() => expect(useDiffStore.getState().detailsError).toBe(gone.message));
  });
});
