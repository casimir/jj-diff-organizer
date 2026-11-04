import { useEffect, type ReactNode } from "react";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";

import { Zone, zoneAt, type DragSource } from "@/graph/drop";
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
  const hasTarget = useDragStore((s) => s.target !== null || s.terminal);
  const command = useDragStore(selectCommand);
  if (!source) return null;
  return (
    <div className="w-max rounded bg-canvas px-2 py-1 font-mono whitespace-nowrap shadow ring-1 ring-accent">
      {hasTarget ? (command ?? "no drop here") : label(source)}
    </div>
  );
}

/** Drags start in the graph and the details pane, and end on graph rows, so one provider wraps both. */
export function DragLayer({ children }: { children: ReactNode }) {
  useTrackShiftWhileDragging();
  return (
    <DragDropProvider
      onDragStart={({ operation }) => {
        const source: DragSource = operation.source?.data.source;
        const shift = operation.activatorEvent instanceof PointerEvent && operation.activatorEvent.shiftKey;
        useDragStore.getState().start(source, shift);
      }}
      onDragMove={({ operation }) => {
        const { target } = operation;
        if (!target) return useDragStore.getState().over(null, Zone.Onto);
        if (target.data.terminal) return useDragStore.getState().overTerminal();
        const rect = target.shape?.boundingRectangle;
        if (!rect) return;
        useDragStore
          .getState()
          .over(target.data.change, zoneAt(operation.position.current.y, rect.top, rect.height));
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
