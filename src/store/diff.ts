import { create } from "zustand";

import * as api from "@/api";
import { hunkKeys, pruneCollapseOverrides } from "@/core/hunks";
import { errorMessage } from "@/error";
import { isWorkingCopy, useGraphStore } from "@/store/graph";
import type { FileView, Marks } from "@/types";

interface DiffState {
  loadedId: string | null;
  files: FileView[];
  marks: Marks;
  collapse: Record<string, boolean>;
  detailsError: string | null;
  load: (changeId: string | null) => void;
  markHunk: (path: string, key: string, reviewed: boolean) => Promise<void>;
  markFile: (path: string, reviewed: boolean) => Promise<void>;
  setCollapsed: (path: string, collapsed: boolean) => void;
  reportDetailsError: (e: unknown) => void;
  refresh: () => Promise<void>;
  reloadMarks: (changeIds: string[]) => Promise<void>;
}

type ActionKey = {
  [K in keyof DiffState]: DiffState[K] extends (...args: never[]) => unknown ? K : never;
}[keyof DiffState];

let latestDetails = 0;
let latestMarks = 0;
let requested: string | null = null;

const EMPTY_DETAILS: Omit<DiffState, ActionKey> = {
  loadedId: null,
  files: [],
  marks: {},
  collapse: {},
  detailsError: null,
};

export const useDiffStore = create<DiffState>((set, get) => {
  const loadDetails = async (changeId: string) => {
    const seq = ++latestDetails;
    try {
      const [files, marks] = await Promise.all([api.show(changeId), api.marks(changeId)]);
      if (seq !== latestDetails) return;

      const collapse = pruneCollapseOverrides(get().collapse, get(), { files, marks });
      set({ loadedId: changeId, files, marks, collapse, detailsError: null });
    } catch (e) {
      if (seq === latestDetails) {
        set({ ...EMPTY_DETAILS, detailsError: errorMessage(e) });
      }
    }
  };

  const loadMarks = async (changeId: string) => {
    const seq = ++latestMarks;
    try {
      const marks = await api.marks(changeId);
      if (seq === latestMarks && requested === changeId) {
        set((s) => ({ marks, collapse: pruneCollapseOverrides(s.collapse, s, { files: s.files, marks }) }));
      }
    } catch (e) {
      if (seq === latestMarks && requested === changeId) {
        set({ detailsError: errorMessage(e) });
      }
    }
  };

  const markWith = async (path: string, write: (changeId: string, shownKeys: string[]) => Promise<void>) => {
    const { loadedId: changeId, files } = get();
    const file = files.find((f) => f.path === path);
    if (!changeId || !file || !isWorkingCopy(useGraphStore.getState(), changeId)) return;

    const shownKeys = hunkKeys(file);
    if (shownKeys.length === 0) return;

    try {
      await write(changeId, shownKeys);
    } catch (e) {
      useGraphStore.setState({ error: errorMessage(e) });
      return;
    }
    await loadMarks(changeId);
  };

  return {
    ...EMPTY_DETAILS,

    load: (changeId) => {
      requested = changeId;
      latestDetails++;
      set(EMPTY_DETAILS);
      if (changeId) {
        void loadDetails(changeId);
      }
    },

    markHunk: (path, key, reviewed) =>
      markWith(path, (changeId, shownKeys) => api.reviewSetHunk(changeId, path, key, reviewed, shownKeys)),

    markFile: (path, reviewed) =>
      markWith(path, (changeId, shownKeys) => api.reviewSetFile(changeId, path, reviewed, shownKeys)),

    setCollapsed: (path, collapsed) => set((s) => ({ collapse: { ...s.collapse, [path]: collapsed } })),

    reportDetailsError: (e) => set({ detailsError: errorMessage(e) }),

    refresh: async () => {
      if (requested) {
        await loadDetails(requested);
      }
    },

    reloadMarks: async (changeIds) => {
      if (requested && changeIds.includes(requested)) {
        await loadMarks(requested);
      }
    },
  };
});
