import { create } from "zustand";

import * as api from "@/api";
import { describeAction, Zone, type DragSource, type DropAction, type DropEffect } from "@/graph/drop";
import { useGraphStore } from "@/store/graph";
import { useHistoryStore } from "@/store/history";
import { useRunStore } from "@/store/run";
import { useUiStore } from "@/store/ui";

/** Where the pointer grabbed the source, relative to its top-left corner. */
interface Grab {
  x: number;
  y: number;
}

interface DragState {
  source: DragSource | null;
  grab: Grab;
  targetId: string | null;
  effect: DropEffect | null;
  zone: Zone;
  shift: boolean;
  start: (source: DragSource, shift: boolean, grab: Grab) => void;
  over: (targetId: string | null, effect: DropEffect | null, zone: Zone) => void;
  setShift: (shift: boolean) => void;
  end: () => void;
  drop: () => Promise<void>;
}

const idle = {
  source: null,
  grab: { x: 0, y: 0 },
  targetId: null,
  effect: null,
  zone: Zone.Onto,
  shift: false
};

export function selectAction(s: DragState): DropAction | null {
  return s.source && s.effect ? s.effect(s.source, s) : null;
}

export const selectCommand = (s: DragState): string | null => {
  const a = selectAction(s);
  return a && describeAction(a);
};

export const useDragStore = create<DragState>((set, get) => ({
  ...idle,
  start: (source, shift, grab) => set({ ...idle, source, shift, grab }),
  over: (targetId, effect, zone) => set({ targetId, effect, zone }),
  setShift: (shift) => set({ shift }),
  end: () => set(idle),

  drop: async () => {
    const a = selectAction(get());
    if (!a) return;

    if (a.kind === "insert") return useUiStore.getState().insertIntoTerminal(`${a.text} `);

    try {
      const run = await useRunStore.getState().run(a.args, a.hunk);
      if (run.exit_code !== 0) {
        useHistoryStore.getState().select(`failure-${run.id}`);
      }
    } catch (e) {
      useGraphStore.setState({ error: api.errorMessage(e) });
    }
  },
}));
