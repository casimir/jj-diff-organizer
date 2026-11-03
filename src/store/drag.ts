import { create } from "zustand";

import * as api from "@/api";
import { displayCommand, dropArgs, Zone, type DragSource } from "@/graph/drop";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import type { Change } from "@/types";

interface DragState {
  source: DragSource | null;
  target: Change | null;
  zone: Zone;
  shift: boolean;
  start: (source: DragSource, shift: boolean) => void;
  over: (target: Change | null, zone: Zone) => void;
  setShift: (shift: boolean) => void;
  end: () => void;
  drop: () => Promise<void>;
}

const idle = { source: null, target: null, zone: Zone.Onto, shift: false };

function args(s: DragState): string[] | null {
  return s.source && s.target ? dropArgs(s.source, s.target, s.zone, s.shift) : null;
}

export const selectCommand = (s: DragState): string | null => {
  const a = args(s);
  return a && displayCommand(a);
};

export const useDragStore = create<DragState>((set, get) => ({
  ...idle,
  start: (source, shift) => set({ ...idle, source, shift }),
  over: (target, zone) => set({ target, zone }),
  setShift: (shift) => set({ shift }),
  end: () => set(idle),

  drop: async () => {
    const a = args(get());
    if (!a) return;
    try {
      const source = get().source;
      const run = await api.runJj(a, source?.kind === "hunk" ? { path: source.path, digest: source.digest } : undefined);
      if (run.exit_code !== 0) useHistoryStore.getState().select(`failure-${run.id}`);
    } catch (e) {
      useGraphStore.setState({ error: api.errorMessage(e) });
    }
  },
}));
