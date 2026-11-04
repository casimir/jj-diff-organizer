import { useEffect, type ReactNode } from "react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";

import { Zone, zoneAt, type DragSource, type DropEffect } from "@/graph/drop";
import { selectCommand, useDragStore } from "@/store/drag";

function useTrackShiftWhileDragging() {
  const dragging = useDragStore((s) => s.source !== null);
  useEffect(() => {
    if (!dragging) return;
    const track = (e: KeyboardEvent | PointerEvent) => useDragStore.getState().setShift(e.shiftKey);
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    window.addEventListener("pointermove", track);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
      window.removeEventListener("pointermove", track);
    };
  }, [dragging]);
}

function label(source: DragSource): string {
  switch (source.kind) {
    case "change":
      return source.change.short;
    case "bookmark":
      return source.name;
    case "wc":
      return "@";
    case "file":
      return source.path;
    case "hunk":
      return `hunk of ${source.path}`;
  }
}

function DragPreview() {
  const source = useDragStore((s) => s.source);
  const hasTarget = useDragStore((s) => s.effect !== null);
  const command = useDragStore(selectCommand);
  if (!source) return null;
  return (
    <div className="w-max rounded bg-canvas px-2 py-1 font-mono whitespace-nowrap shadow ring-1 ring-accent">
      {hasTarget ? (command ?? "no drop here") : label(source)}
    </div>
  );
}

type Entity = { data: Record<string, any> } | null | undefined;

const sourceOf = (draggable: Entity): DragSource | null => draggable?.data.source ?? null;
const effectOf = (droppable: Entity): DropEffect | null => droppable?.data.effect ?? null;

export function DragLayer({ children }: { children: ReactNode }) {
  useTrackShiftWhileDragging();
  return (
    <DragDropProvider
      onDragStart={({ operation }) => {
        const source = sourceOf(operation.source);
        if (!source) return;

        const shift = operation.activatorEvent instanceof PointerEvent && operation.activatorEvent.shiftKey;
        useDragStore.getState().start(source, shift);
      }}
      onDragMove={({ operation }) => {
        const { target } = operation;
        if (!target) return useDragStore.getState().over(null, null, Zone.Onto);

        const rect = target.shape?.boundingRectangle;
        if (!rect) return;

        useDragStore
          .getState()
          .over(String(target.id), effectOf(target), zoneAt(operation.position.current.y, rect.top, rect.height));
      }}
      onDragEnd={({ canceled }) => {
        const { drop, end } = useDragStore.getState();
        if (!canceled) void drop();
        end();
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        <DragPreview />
      </DragOverlay>
    </DragDropProvider>
  );
}
