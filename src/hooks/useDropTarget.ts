import { useMemo, type RefObject } from "react";
import { useDroppable } from "@dnd-kit/react";

import { labelIntersection } from "@/core/dnd/collision";
import { accepts, dropProps, DropState, Tone, type Handler } from "@/core/dnd/model";
import { selectGroupActive, selectSlot, useDragStore } from "@/store/drag";

/** Attributes `src/index.css` styles drop targets from. */
export interface DropAttributes {
  "data-drop": DropState | undefined;
  "data-tone": Tone;
}

interface DropTargetOptions {
  handler: Handler;
  group: string;
  tone?: Tone;
}

/** Registers `element` as a drop target of `group`: shows the slot the drop applies while hovered. */
export function useDropTarget(
  id: string,
  element: RefObject<HTMLElement | null>,
  { handler, group, tone = Tone.Accent }: DropTargetOptions,
): DropAttributes {
  useDroppable({ id, element, collisionDetector: labelIntersection, ...dropProps({ handler, group, tone }) });
  const slot = useDragStore((s) => selectSlot(s, id));
  return { "data-drop": slot ?? undefined, "data-tone": tone };
}

/** Marks the container of `group` as a candidate while some member accepts the object and none is hovered. */
export function useDropGroup(group: string, handlers: readonly Handler[], tone: Tone = Tone.Accent): DropAttributes {
  const object = useDragStore((s) => s.object);
  const active = useDragStore((s) => selectGroupActive(s, group));
  const candidate = useMemo(
    () => object !== null && handlers.some((handler) => accepts(handler, object)),
    [handlers, object],
  );
  return { "data-drop": candidate && !active ? DropState.Candidate : undefined, "data-tone": tone };
}

/** A drop target that is its own group. */
export function useSoloDropTarget(
  id: string,
  element: RefObject<HTMLElement | null>,
  { handler, tone }: Omit<DropTargetOptions, "group">,
): DropAttributes {
  const target = useDropTarget(id, element, { handler, group: id, tone });
  const handlers = useMemo(() => [handler], [handler]);
  const group = useDropGroup(id, handlers, tone);
  return { ...group, "data-drop": target["data-drop"] ?? group["data-drop"] };
}
