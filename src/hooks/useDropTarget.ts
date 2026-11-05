import { useMemo, type RefObject } from "react";
import { useDroppable } from "@dnd-kit/react";

import { dropActions, dropProps, DropState, isDestructive, type DropEffect } from "@/graph/drop";
import { selectAction, useDragStore } from "@/store/drag";

/** Registers `element` as a drop target. `state` is how it presents itself, `destructive` whether dropping here destroys something. */
export function useDropTarget(
  id: string,
  element: RefObject<HTMLElement | null>,
  effect: DropEffect,
): { active: boolean; state: DropState | undefined; destructive: boolean } {
  useDroppable({ id, element, ...dropProps(effect) });
  const active = useDragStore((s) => s.targetId === id && selectAction(s) !== null);
  const source = useDragStore((s) => s.source);
  const actions = useMemo(() => (source ? dropActions(effect, source) : []), [effect, source]);
  const state = active ? DropState.Onto : actions.length > 0 ? DropState.Candidate : undefined;
  return { active, state, destructive: actions.some(isDestructive) };
}

/** The attributes `src/index.css` styles drop targets from. */
export const dropAttributes = (
  state: DropState | undefined,
  destructive: boolean,
): { "data-drop": DropState | undefined; "data-destructive": true | undefined } => ({
  "data-drop": state,
  "data-destructive": destructive || undefined,
});
