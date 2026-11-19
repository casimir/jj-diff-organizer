import { create } from "zustand";

import * as api from "@/api";
import { errorMessage } from "@/error";
import type { Change, RepoInfo } from "@/types";

interface GraphState {
  root: string;
  revset: string;
  changes: Change[];
  error: string | null;
  init: (info: RepoInfo) => Promise<void>;
  setRevset: (revset: string) => Promise<void>;
  refresh: () => Promise<void>;
}

let latestRefresh = 0;

/** Review marks apply to the working copy only. */
export const isWorkingCopy = ({ changes }: Pick<GraphState, "changes">, changeId: string | null | undefined) =>
  changes.find((c) => c.change_id === changeId)?.wc ?? false;

export const useGraphStore = create<GraphState>((set, get) => ({
  root: "",
  revset: "",
  changes: [],
  error: null,

  init: async (info) => {
    set({ root: info.root, revset: info.default_revset });
    await get().refresh();
  },

  setRevset: async (revset) => {
    set({ revset });
    await get().refresh();
  },

  refresh: async () => {
    const seq = ++latestRefresh;
    try {
      const changes = await api.graph(get().revset);
      if (seq === latestRefresh) set({ changes, error: null });
    } catch (e) {
      if (seq === latestRefresh) set({ error: errorMessage(e) });
    }
  },
}));
