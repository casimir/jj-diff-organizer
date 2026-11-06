import { create } from "zustand";

import * as api from "@/api";
import { displayCommand } from "@/graph/drop";
import type { HunkRef, Run } from "@/types";

interface RunState {
  command: string | null;
  run: (args: string[], hunk?: HunkRef) => Promise<Run>;
}

export const useRunStore = create<RunState>((set) => ({
  command: null,
  run: async (args, hunk) => {
    set({ command: displayCommand(args) });
    try {
      return await api.runJj(args, hunk);
    } finally {
      set({ command: null });
    }
  },
}));
