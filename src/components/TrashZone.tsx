import { useRef } from "react";
import { Trash2 } from "lucide-react";

import { DropState, trashEffect } from "@/graph/drop";
import { dropAttributes, useDropCandidate, useDropTarget } from "@/hooks/useDropTarget";
import { useDragStore } from "@/store/drag";

const EFFECTS = [trashEffect];

export function TrashZone() {
  const zone = useRef<HTMLDivElement>(null);
  const dragging = useDragStore((s) => s.source !== null);
  const active = useDropTarget("trash", zone, trashEffect);
  const { candidate, destructive } = useDropCandidate(EFFECTS);
  if (!dragging) return null;

  return (
    <div
      ref={zone}
      {...dropAttributes(active ? DropState.Onto : candidate ? DropState.Candidate : undefined, destructive)}
      className="absolute inset-y-0 right-0 z-(--z-trash) flex w-(--trash-size) items-center justify-center bg-removed text-danger"
    >
      <Trash2 className="size-6" />
    </div>
  );
}
