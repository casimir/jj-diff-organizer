import { create } from "zustand";

import * as api from "@/api";
import { displayCommand, dropArgs, shellQuote, Zone, type DragSource } from "@/graph/drop";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import { useUiStore } from "@/store/ui";
import type { Change } from "@/types";

interface DragState {
  source: DragSource | null;
  target: Change | null;
  terminal: boolean;
  zone: Zone;
  shift: boolean;
  start: (source: DragSource, shift: boolean) => void;
  over: (target: Change | null, zone: Zone) => void;
  overTerminal: () => void;
  setShift: (shift: boolean) => void;
  end: () => void;
  drop: () => Promise<void>;
}

const idle = { source: null, target: null, terminal: false, zone: Zone.Onto, shift: false };

function args(s: DragState): string[] | null {
  return s.source && s.target ? dropArgs(s.source, s.target, s.zone, s.shift) : null;
}

function terminalPath(s: DragState): string | null {
  return s.terminal && s.source?.kind === "file" ? shellQuote(s.source.path) : null;
}

export const selectCommand = (s: DragState): string | null => {
  if (s.terminal) return terminalPath(s);
  const a = args(s);
  return a && displayCommand(a);
};

export const useDragStore = create<DragState>((set, get) => ({
  ...idle,
  start: (source, shift) => set({ ...idle, source, shift }),
  over: (target, zone) => set({ target, zone, terminal: false }),
  overTerminal: () => set({ target: null, terminal: true }),
  setShift: (shift) => set({ shift }),
  end: () => set(idle),

  drop: async () => {
    const path = terminalPath(get());
    if (path) return useUiStore.getState().insertIntoTerminal(`${path} `);
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
