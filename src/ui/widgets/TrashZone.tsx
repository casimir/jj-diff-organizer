import { useRef } from "react";
import { Trash2 } from "lucide-react";

import { Tone } from "@/core/dnd/model";
import { trashHandler } from "@/core/dnd/targets/trash";
import { useSoloDropTarget } from "@/hooks/useDropTarget";
import { useDragStore } from "@/store/drag";

export function TrashZone() {
  const zone = useRef<HTMLDivElement>(null);
  const dragging = useDragStore((s) => s.object !== null);
  const dropTarget = useSoloDropTarget("trash", zone, { handler: trashHandler, tone: Tone.Danger });
  if (!dragging) return null;

  return (
    <div
      ref={zone}
      {...dropTarget}
      className="absolute inset-y-0 right-0 z-(--z-trash) flex w-(--trash-size) items-center justify-center bg-removed text-danger"
    >
      <Trash2 className="size-6" />
    </div>
  );
}
