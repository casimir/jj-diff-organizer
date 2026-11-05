import type { RefObject } from "react";
import { useDraggable } from "@dnd-kit/react";

import { dragProps, type DragSource } from "@/graph/drop";

/** Registers `element` as a drag source. Returns the attributes `src/index.css` styles drag sources from: none when disabled. */
export function useDragSource(
  id: string,
  element: RefObject<HTMLElement | null>,
  source: DragSource | undefined,
  disabled = false,
): { "data-drag"?: "source" | "idle" } {
  const { isDragSource } = useDraggable({ id, element, disabled, ...(source && dragProps(source)) });
  return disabled ? {} : { "data-drag": isDragSource ? "source" : "idle" };
}
