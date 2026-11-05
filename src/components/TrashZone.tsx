import { useRef } from "react";
import { Trash2 } from "lucide-react";

import { trashEffect } from "@/graph/drop";
import { dropAttributes, useDropTarget } from "@/hooks/useDropTarget";
import { useDragStore } from "@/store/drag";

export function TrashZone() {
  const zone = useRef<HTMLDivElement>(null);
  const dragging = useDragStore((s) => s.source !== null);
  const { state, destructive } = useDropTarget("trash", zone, trashEffect);
  if (!dragging) return null;

  return (
    <div
      ref={zone}
      {...dropAttributes(state, destructive)}
      className="absolute inset-y-0 right-0 z-(--z-trash) flex w-(--trash-size) items-center justify-center bg-removed text-danger"
    >
      <Trash2 className="size-6" />
    </div>
  );
}
