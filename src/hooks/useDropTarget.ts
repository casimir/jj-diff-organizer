import { useMemo, type RefObject } from "react";
import { useDroppable } from "@dnd-kit/react";

import { labelIntersection } from "@/graph/collision";
import { dropActions, dropProps, DropState, isDestructive, type DropEffect } from "@/graph/drop";
import { selectAction, useDragStore } from "@/store/drag";

export function useDropTarget(id: string, element: RefObject<HTMLElement | null>, effect: DropEffect): boolean {
  useDroppable({ id, element, collisionDetector: labelIntersection, ...dropProps(effect) });
  return useDragStore((s) => s.targetId === id && selectAction(s) !== null);
}

export function useDropCandidate(effects: readonly DropEffect[]): { candidate: boolean; destructive: boolean } {
  const source = useDragStore((s) => s.source);
  const actions = useMemo(() => (source ? effects.flatMap((effect) => dropActions(effect, source)) : []), [effects, source]);
  return { candidate: actions.length > 0, destructive: actions.some(isDestructive) };
}

export const dropAttributes = (
  state: DropState | undefined,
  destructive: boolean,
): { "data-drop": DropState | undefined; "data-destructive": true | undefined } => ({
  "data-drop": state,
  "data-destructive": destructive || undefined,
});
