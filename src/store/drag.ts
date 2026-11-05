import { create } from "zustand";

import * as api from "@/api";
import { describeAction, Zone, type DragSource, type DropAction, type DropEffect } from "@/graph/drop";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import { useUiStore } from "@/store/ui";
import { HunkOp } from "@/types";

interface DragState {
  source: DragSource | null;
  targetId: string | null;
  effect: DropEffect | null;
  zone: Zone;
  shift: boolean;
  start: (source: DragSource, shift: boolean) => void;
  over: (targetId: string | null, effect: DropEffect | null, zone: Zone) => void;
  setShift: (shift: boolean) => void;
  end: () => void;
  drop: () => Promise<void>;
}

const idle = { source: null, targetId: null, effect: null, zone: Zone.Onto, shift: false };

function action(s: DragState): DropAction | null {
  return s.source && s.effect ? s.effect(s.source, s) : null;
}

export const selectCommand = (s: DragState): string | null => {
  const a = action(s);
  return a && describeAction(a);
};

export const useDragStore = create<DragState>((set, get) => ({
  ...idle,
  start: (source, shift) => set({ ...idle, source, shift }),
  over: (targetId, effect, zone) => set({ targetId, effect, zone }),
  setShift: (shift) => set({ shift }),
  end: () => set(idle),

  drop: async () => {
    const a = action(get());
    if (!a) return;

    if (a.kind === "insert") return useUiStore.getState().insertIntoTerminal(`${a.text} `);

    try {
      const source = get().source;
      const run = await api.runJj(a.args, source?.kind === "hunk" ? { op: HunkOp.Keep, path: source.path, digest: source.digest } : undefined);
      if (run.exit_code !== 0) useHistoryStore.getState().select(`failure-${run.id}`);
    } catch (e) {
      useGraphStore.setState({ error: api.errorMessage(e) });
    }
  },
}));
