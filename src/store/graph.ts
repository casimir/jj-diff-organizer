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

/**
 * Returns whether a change takes review marks.
 *
 * @remarks
 * Immutable changes are read-only. Divergent commits are too: they share a change ID, and the offset
 * that tells them apart changes with every rewrite, so no stable key can hold their marks.
 */
export const takesReview = (change: Change | undefined) => !!change && !change.immutable && !change.divergent;

export const isReviewable = ({ changes }: Pick<GraphState, "changes">, changeId: string | null | undefined) =>
  takesReview(changes.find((c) => c.change_id === changeId));

/** Returns a change ID without its divergence offset (`xyz/1` → `xyz`). */
export const bareChangeId = (changeId: string) => changeId.split("/")[0];

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
