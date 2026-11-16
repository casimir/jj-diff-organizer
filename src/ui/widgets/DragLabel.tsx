import { useRef, type ReactNode } from "react";

import type { DragObject } from "@/core/dnd/objects";
import { useDragObject } from "@/hooks/useDragObject";
import { Chip, type ChipTone } from "@/ui/components/Chip";

export function DragLabel({ id, object, tone, className, children }: {
  id: string;
  object: DragObject;
  tone: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const dragAttributes = useDragObject(id, ref, object);
  return (
    <Chip ref={ref} tone={tone} className={className} {...dragAttributes}>
      {children}
    </Chip>
  );
}
