import type { RefObject } from "react";
import { useDraggable } from "@dnd-kit/react";

import { dragProps, type DragObject } from "@/core/dnd/objects";

/** Registers `element` as a handle for dragging `object`. Returns the attributes `src/index.css` styles it from: none when disabled. */
export function useDragObject(
  id: string,
  element: RefObject<HTMLElement | null>,
  object: DragObject | undefined,
  disabled = false,
): { "data-drag"?: "source" | "idle" } {
  const { isDragSource } = useDraggable({ id, element, disabled, ...(object && dragProps(object)) });
  return disabled ? {} : { "data-drag": isDragSource ? "source" : "idle" };
}
