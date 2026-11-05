import { useRef, type ReactNode } from "react";

import { Chip, type ChipTone } from "@/components/ui/Chip";
import type { DragSource } from "@/graph/drop";
import { useDragSource } from "@/hooks/useDragSource";

export function DragLabel({ id, source, tone, className, children }: {
  id: string;
  source: DragSource;
  tone: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const dragAttributes = useDragSource(id, ref, source);
  return (
    <Chip ref={ref} tone={tone} className={className} {...dragAttributes}>
      {children}
    </Chip>
  );
}
