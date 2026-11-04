import { useRef, type ReactNode } from "react";
import { useDraggable } from "@dnd-kit/react";

import { dragProps, type DragSource } from "@/graph/drop";

export function DragLabel({ id, source, className, children }: {
  id: string;
  source: DragSource;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { isDragSource } = useDraggable({ id, element: ref, ...dragProps(source) });
  return (
    <span ref={ref} className={`${className} ${isDragSource ? "dragging" : "cursor-grab"}`}>
      {children}
    </span>
  );
}
