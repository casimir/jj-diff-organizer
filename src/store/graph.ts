import { create } from "zustand";

import * as api from "@/api";
import { HunkState, nextHunk, samePos, type HunkPos } from "@/review/hunks";
import type { Change, FileView, Marks, RepoInfo } from "@/types";

export const SelectMode = {
  Replace: "replace",
  Toggle: "toggle",
  Range: "range",
} as const;
export type SelectMode = (typeof SelectMode)[keyof typeof SelectMode];

interface GraphState {
  root: string;
  revset: string;
  changes: Change[];
  error: string | null;
  selectedId: string | null;
  files: FileView[];
  marks: Marks;
  /** The file the review keys act on; always one of `selectedPaths`, whose diffs are shown together. */
  selectedPath: string | null;
  selectedPaths: string[];
  cursor: HunkPos | null;
  detailsError: string | null;
  init: (info: RepoInfo) => Promise<void>;
  setRevset: (revset: string) => Promise<void>;
  select: (changeId: string) => Promise<void>;
  moveChange: (step: 1 | -1) => void;
  moveFile: (step: 1 | -1) => void;
  selectFile: (path: string, mode?: SelectMode) => void;
  selectAllFiles: () => void;
  setCursor: (pos: HunkPos) => void;
  moveCursor: (step: 1 | -1, onlyUnreviewed: boolean) => void;
  toggleHunk: () => Promise<void>;
  toggleFile: (path?: string) => Promise<void>;
  refresh: () => Promise<void>;
  reloadMarks: (changeIds: string[]) => Promise<void>;
}

let latestRefresh = 0;
let latestDetails = 0;
let latestMarks = 0;

const firstHunk = (file: FileView | undefined): HunkPos | null =>
  file && file.digests.length > 0 ? { path: file.path, group: 0 } : null;

export const selectSelectedChange = (s: Pick<GraphState, "changes" | "selectedId">) =>
  s.changes.find((c) => c.change_id === s.selectedId);

/** Review marks apply to the working copy only. */
export const selectIsWorkingCopy = (s: Pick<GraphState, "changes" | "selectedId">) =>
  selectSelectedChange(s)?.wc ?? false;

export const useGraphStore = create<GraphState>((set, get) => {
  const loadDetails = async (changeId: string) => {
    const seq = ++latestDetails;
    try {
      const [files, marks] = await Promise.all([api.show(changeId), api.marks(changeId)]);
      if (seq !== latestDetails) return;
      const { selectedPath, selectedPaths, cursor } = get();
      const kept = files.filter((f) => selectedPaths.includes(f.path)).map((f) => f.path);
      const paths = kept.length > 0 ? kept : files.slice(0, 1).map((f) => f.path);
      const file = files.find((f) => f.path === selectedPath && paths.includes(f.path)) ?? files.find((f) => f.path === paths[0]);
      const stillThere = cursor && file?.path === cursor.path && cursor.group < file.digests.length;
      set({
        files,
        marks,
        detailsError: null,
        selectedPath: file?.path ?? null,
        selectedPaths: paths,
        cursor: stillThere ? cursor : firstHunk(file),
      });
    } catch (e) {
      if (seq === latestDetails) set({ files: [], marks: {}, cursor: null, detailsError: api.errorMessage(e) });
    }
  };

  const loadMarks = async (changeId: string) => {
    const seq = ++latestMarks;
    try {
      const marks = await api.marks(changeId);
      if (seq === latestMarks && get().selectedId === changeId) set({ marks });
    } catch (e) {
      if (seq === latestMarks && get().selectedId === changeId) set({ detailsError: api.errorMessage(e) });
    }
  };

  const toggle = async (file: FileView, digests: string[], reviewed: boolean) => {
    const changeId = get().selectedId;
    if (!changeId || !selectIsWorkingCopy(get()) || digests.length === 0) return;
    try {
      await api.reviewSet(changeId, file.path, digests, reviewed, file.digests);
    } catch (e) {
      set({ error: api.errorMessage(e) });
      return;
    }
    await loadMarks(changeId);
  };

  return {
    root: "",
    revset: "",
    changes: [],
    error: null,
    selectedId: null,
    files: [],
    marks: {},
    selectedPath: null,
    selectedPaths: [],
    cursor: null,
    detailsError: null,

    init: async (info) => {
      set({ root: info.root, revset: info.default_revset });
      await get().refresh();
      const wc = get().changes.find((c) => c.wc);
      if (wc) await get().select(wc.change_id);
    },

    setRevset: async (revset) => {
      set({ revset });
      await get().refresh();
    },

    select: async (changeId) => {
      if (get().selectedId === changeId) return;
      set({
        selectedId: changeId,
        files: [],
        marks: {},
        selectedPath: null,
        selectedPaths: [],
        cursor: null,
        detailsError: null,
      });
      await loadDetails(changeId);
    },

    moveChange: (step) => {
      const { changes, selectedId } = get();
      const at = changes.findIndex((c) => c.change_id === selectedId);
      const next = changes[at === -1 ? (step === 1 ? 0 : changes.length - 1) : at + step];
      if (next) void get().select(next.change_id);
    },

    moveFile: (step) => {
      const { files, selectedPath } = get();
      const at = files.findIndex((f) => f.path === selectedPath);
      const next = files[at === -1 ? 0 : at + step];
      if (next) get().selectFile(next.path);
    },

    selectFile: (path, mode = SelectMode.Replace) => {
      const { files, selectedPath, selectedPaths } = get();
      const order = files.map((f) => f.path);
      if (!order.includes(path)) return;
      let paths = [path];
      if (mode === SelectMode.Range && selectedPath) {
        const [from, to] = [order.indexOf(selectedPath), order.indexOf(path)].sort((a, b) => a - b);
        paths = order.slice(from, to + 1);
      } else if (mode === SelectMode.Toggle) {
        paths = selectedPaths.includes(path)
          ? selectedPaths.filter((p) => p !== path)
          : order.filter((p) => p === path || selectedPaths.includes(p));
        if (paths.length === 0) paths = [path];
      }
      const active = paths.includes(path) ? path : paths[paths.length - 1];
      const file = files.find((f) => f.path === active);
      set({
        selectedPaths: paths,
        selectedPath: active,
        cursor: firstHunk(file),
      });
    },

    selectAllFiles: () => set((s) => ({ selectedPaths: s.files.map((f) => f.path) })),

    setCursor: (cursor) => set({ cursor, selectedPath: cursor.path }),

    moveCursor: (step, onlyUnreviewed) => {
      const { files, marks, cursor, selectedPaths } = get();
      const wanted = onlyUnreviewed ? (s: HunkState) => s !== HunkState.Reviewed : undefined;
      const several = selectedPaths.length > 1;
      const scope = several ? files.filter((f) => selectedPaths.includes(f.path)) : files;
      const next = nextHunk(scope, marks, cursor, step, wanted);
      if (!next || samePos(next, cursor)) return;
      set({ cursor: next, selectedPath: next.path, selectedPaths: several ? selectedPaths : [next.path] });
    },

    toggleHunk: async () => {
      const { files, marks, cursor } = get();
      const file = files.find((f) => f.path === cursor?.path);
      const digest = file && cursor ? file.digests[cursor.group] : undefined;
      if (file && digest) await toggle(file, [digest], !(marks[file.path] ?? []).includes(digest));
    },

    toggleFile: async (path = get().selectedPath ?? undefined) => {
      const file = get().files.find((f) => f.path === path);
      if (!file) return;
      const marked = get().marks[file.path] ?? [];
      await toggle(file, file.digests, !file.digests.every((d) => marked.includes(d)));
    },

    refresh: async () => {
      const seq = ++latestRefresh;
      const { revset, selectedId } = get();
      const details = selectedId ? loadDetails(selectedId) : Promise.resolve();
      try {
        const changes = await api.graph(revset);
        if (seq === latestRefresh) set({ changes, error: null });
      } catch (e) {
        if (seq === latestRefresh) set({ error: api.errorMessage(e) });
      }
      await details;
    },

    reloadMarks: async (changeIds) => {
      const { selectedId } = get();
      if (selectedId && changeIds.includes(selectedId)) await loadMarks(selectedId);
    },
  };
});
