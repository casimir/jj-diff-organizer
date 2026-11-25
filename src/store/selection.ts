import { create } from "zustand";

import * as api from "@/api";
import { HunkState, needsReview } from "@/core/hunks";
import {
  collapsedIn,
  fit,
  moveFile,
  nextHunk,
  sameLeaf,
  sameSelection,
  scrolled,
  type Data,
  type FileSelection,
  type Selection,
} from "@/core/selection";
import { errorMessage } from "@/error";
import { useDiffStore } from "@/store/diff";
import { isWorkingCopy, useGraphStore } from "@/store/graph";
import type { FileView } from "@/types";

interface Reveal {
  target: "file" | "leaf";
}

interface SelectionState {
  selection: Selection | null;
  remembered: Record<string, Selection>;
  reveal: Reveal | null;
  selectChange: (changeId: string) => void;
  moveChange: (step: 1 | -1) => void;
  selectWorkingCopy: () => void;
  moveFile: (step: 1 | -1) => void;
  selectFile: (path: string) => void;
  clickFile: (path: string) => void;
  selectHunk: (path: string, hunk: string) => void;
  moveHunk: (step: 1 | -1, onlyUnreviewed: boolean) => void;
  toggleHunk: (advance?: boolean) => Promise<void>;
  toggleFile: (path?: string) => Promise<void>;
  toggleGroup: (paths: string[]) => Promise<void>;
  toggleCollapse: (path?: string) => void;
  scrolled: (visible: FileSelection[]) => void;
}

const dataOf = (diff = useDiffStore.getState()): Data => ({
  files: diff.files,
  marks: diff.marks,
  collapse: diff.collapse,
  reviewable: isWorkingCopy(useGraphStore.getState(), diff.loadedId),
});

const fileOf = (path: string | undefined) => useDiffStore.getState().files.find((f) => f.path === path);

let latestFollow = 0;

export function useSelectedChange() {
  const changeId = useSelectionStore((s) => s.selection?.change);
  return useGraphStore((s) => s.changes.find((c) => c.change_id === changeId));
}

export const useIsWorkingCopy = () => useSelectedChange()?.wc ?? false;

export const useSelectionStore = create<SelectionState>((set, get) => {
  const place = (selection: Selection, reveal: Reveal | null = get().reveal) => set({ selection, reveal });

  const mark = async (files: FileView[], write: () => Promise<void>) => {
    const cursor = get().selection?.file?.path;
    const cursorFile = files.find((f) => f.path === cursor);
    const wasCollapsed = cursorFile && collapsedIn(cursorFile, dataOf());
    await write();

    if (cursorFile && !wasCollapsed && get().selection?.file?.path === cursor && collapsedIn(cursorFile, dataOf())) {
      get().moveHunk(1, true);
    }
  };

  return {
    selection: null,
    remembered: {},
    reveal: null,

    selectChange: (changeId) => {
      const { selection, remembered } = get();
      if (selection?.change === changeId) return;

      set({
        selection: remembered[changeId] ?? { change: changeId },
        remembered: selection ? { ...remembered, [selection.change]: selection } : remembered,
      });
      useDiffStore.getState().load(changeId);
    },

    moveChange: (step) => {
      const { changes } = useGraphStore.getState();
      const at = changes.findIndex((c) => c.change_id === get().selection?.change);
      const next = changes[at === -1 ? (step === 1 ? 0 : changes.length - 1) : at + step];
      if (next) {
        get().selectChange(next.change_id);
      }
    },

    selectWorkingCopy: () => {
      const wc = useGraphStore.getState().changes.find((c) => c.wc);
      if (wc) {
        get().selectChange(wc.change_id);
      }
    },

    moveFile: (step) => {
      const { selection } = get();
      if (selection) {
        place(moveFile(selection, dataOf(), step), { target: "file" });
      }
    },

    selectFile: (path) => {
      const { selection } = get();
      if (!selection || selection.file?.path === path) return;

      place(fit({ change: selection.change, file: { path } }, dataOf()));
    },

    clickFile: (path) => {
      const { selection } = get();
      const file = fileOf(path);
      if (!selection || !file || selection.file?.path === path) return;

      if (collapsedIn(file, dataOf())) {
        useDiffStore.getState().setCollapsed(path, false);
      }
      place(fit({ change: selection.change, file: { path } }, dataOf()), { target: "file" });
    },

    selectHunk: (path, hunk) => {
      const { selection } = get();
      if (selection) {
        place({ change: selection.change, file: { path, hunk } });
      }
    },

    moveHunk: (step, onlyUnreviewed) => {
      const { selection } = get();
      if (!selection) return;

      const data = dataOf();
      const walk = onlyUnreviewed
        ? { wanted: (s: HunkState) => s !== HunkState.Reviewed }
        : { skip: (file: FileView) => collapsedIn(file, data) };
      const next = nextHunk(data.files, data.marks, selection.file, step, walk);
      if (!next || sameLeaf(next, selection.file)) return;

      const file = fileOf(next.path);
      if (file && collapsedIn(file, data)) {
        useDiffStore.getState().setCollapsed(next.path, false);
      }
      place({ change: selection.change, file: next }, { target: "leaf" });
    },

    toggleHunk: async (advance = false) => {
      const file = fileOf(get().selection?.file?.path);
      const hunk = get().selection?.file?.hunk;
      if (!file || hunk === undefined) return;

      const reviewed = (useDiffStore.getState().marks[file.path] ?? []).includes(hunk);
      await mark([file], () => useDiffStore.getState().markHunk(file.path, hunk, !reviewed));
      if (advance && !reviewed && sameLeaf(get().selection?.file, { path: file.path, hunk })) {
        get().moveHunk(1, true);
      }
    },

    toggleFile: async (path = get().selection?.file?.path) => {
      const file = fileOf(path);
      if (!file) return;

      const reviewed = needsReview([file], useDiffStore.getState().marks);
      await mark([file], () => useDiffStore.getState().markFile(file.path, reviewed));
    },

    toggleGroup: async (paths) => {
      const { files, marks } = useDiffStore.getState();
      const targets = files.filter((f) => paths.includes(f.path));
      if (targets.length === 0) return;

      const reviewed = needsReview(targets, marks);
      await mark(targets, () => useDiffStore.getState().markGroup(paths, reviewed));
    },

    toggleCollapse: (path = get().selection?.file?.path) => {
      const file = fileOf(path);
      if (file) {
        useDiffStore.getState().setCollapsed(file.path, !collapsedIn(file, dataOf()));
      }
    },

    scrolled: (visible) => {
      const { selection } = get();
      if (!selection) return;

      const next = scrolled(selection, dataOf(), visible);
      if (next !== selection) {
        place(next);
      }
    },
  };
});

async function followVanished(changeId: string, revset: string, seq: number) {
  let successor: string | undefined;
  let error: string | null = null;
  try {
    const ids = await api.successors(revset, changeId);
    if (ids.length === 1) successor = ids[0];
  } catch (e) {
    error = errorMessage(e);
  }
  if (seq !== latestFollow || useSelectionStore.getState().selection?.change !== changeId) return;

  if (successor) {
    useSelectionStore.getState().selectChange(successor);
    return;
  }
  useSelectionStore.setState({ selection: null });
  useDiffStore.getState().load(null);
  if (error) {
    useGraphStore.setState({ error });
  }
}

useDiffStore.subscribe((diff, prev) => {
  const { selection } = useSelectionStore.getState();
  if (!selection || diff.loadedId !== selection.change) return;

  const next = fit(selection, dataOf(diff));
  if (prev.loadedId !== diff.loadedId || !sameSelection(next, selection)) {
    useSelectionStore.setState({ selection: next, reveal: { target: "leaf" } });
  }
});

useGraphStore.subscribe((graph, prev) => {
  if (graph.changes === prev.changes) return;

  const seq = ++latestFollow;
  const { selection } = useSelectionStore.getState();
  if (selection && !graph.changes.some((c) => c.change_id === selection.change)) {
    void followVanished(selection.change, graph.revset, seq);
  }
});
