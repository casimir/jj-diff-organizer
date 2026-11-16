import { create } from "zustand";

import { describe } from "@/core/command";
import { Slot, type DropData, type Outcome, type Tone } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";

/** Where the pointer grabbed the object, relative to its top-left corner. */
interface Grab {
  x: number;
  y: number;
}

interface HoveredTarget extends DropData {
  id: string;
}

interface DragState {
  object: DragObject | null;
  grab: Grab;
  target: HoveredTarget | null;
  slot: Slot;
  shift: boolean;
  start: (object: DragObject, shift: boolean, grab: Grab) => void;
  over: (target: HoveredTarget | null, slot: Slot) => void;
  setShift: (shift: boolean) => void;
  end: () => void;
}

const idle = {
  object: null,
  grab: { x: 0, y: 0 },
  target: null,
  slot: Slot.Onto,
  shift: false,
};

export function selectOutcome(s: DragState): Outcome | null {
  return s.object && s.target ? s.target.handler(s.object, s) : null;
}

/** The slot the drop applies on this target, or null when the target isn't hovered or refuses the object. */
export function selectSlot(s: DragState, targetId: string): Slot | null {
  if (s.target?.id !== targetId) return null;

  return selectOutcome(s)?.slot ?? null;
}

export const selectGroupActive = (s: DragState, group: string): boolean =>
  s.target?.group === group && selectOutcome(s) !== null;

export function selectTone(s: DragState): Tone | null {
  return s.target && selectOutcome(s) ? s.target.tone : null;
}

export function selectCommand(s: DragState): string | null {
  const outcome = selectOutcome(s);
  return outcome && describe(outcome.command);
}

export const useDragStore = create<DragState>((set) => ({
  ...idle,
  start: (object, shift, grab) => set({ ...idle, object, shift, grab }),
  over: (target, slot) => set((s) => (s.target?.id === target?.id && s.slot === slot ? s : { target, slot })),
  setShift: (shift) => set({ shift }),
  end: () => set(idle),
}));
