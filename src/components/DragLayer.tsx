import { useEffect, useRef, type ReactNode } from "react";
import { DragDropProvider, DragOverlay, useDragDropManager } from "@dnd-kit/react";

import { DRAG_LABEL } from "@/graph/collision";
import { isDestructive, PreviewState, Zone, zoneAt, type DragSource, type DropEffect } from "@/graph/drop";
import { selectAction, selectCommand, useDragStore } from "@/store/drag";

function useTrackShiftWhileDragging() {
  const dragging = useDragStore((s) => s.source !== null);
  useEffect(() => {
    if (!dragging) return;
    // WebKitGTK can leave `shiftKey` set on the keyup of Shift itself.
    const track = (e: KeyboardEvent | PointerEvent) => {
      const shift = e instanceof KeyboardEvent && e.key === "Shift" ? e.type === "keydown" : e.shiftKey;
      useDragStore.getState().setShift(shift);
    };
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

function CancelOnRightClick() {
  const manager = useDragDropManager();
  const dragging = useDragStore((s) => s.source !== null);
  useEffect(() => {
    if (!dragging || !manager) return;

    // Pressing a second button while one is held fires `pointermove`, not `pointerdown`.
    let canceled = false;
    const cancel = (e: PointerEvent) => {
      if (canceled || !(e.buttons & 2)) return;

      canceled = true;
      e.preventDefault();
      manager.actions.stop({ event: e, canceled: true });
      window.addEventListener("contextmenu", (ev) => ev.preventDefault(), { capture: true, once: true });
    };
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("pointermove", cancel, true);
    return () => {
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("pointermove", cancel, true);
    };
  }, [dragging, manager]);
  return null;
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
  const grab = useDragStore((s) => s.grab);
  const command = useDragStore(selectCommand);
  const destructive = useDragStore((s) => {
    const action = selectAction(s);
    return action !== null && isDestructive(action);
  });
  const box = useRef<HTMLDivElement>(null);
  const dragging = source !== null;

  useEffect(() => {
    if (!dragging) return;

    let frame = 0;
    const keepInWindow = () => {
      const el = box.current;
      const labelEl = el?.firstElementChild;
      if (el && labelEl) {
        const shifted = el.style.translate.split(" ").map(parseFloat);
        const [x = grab.x, y = grab.y] = shifted;
        const rect = labelEl.getBoundingClientRect();
        const left = rect.left - x;
        const top = rect.top - y;
        const clamp = (pos: number, size: number, max: number, natural: number) =>
          Math.max(-pos, Math.min(natural, max - pos - size));
        el.style.translate = `${clamp(left, rect.width, window.innerWidth, grab.x)}px ${clamp(top, rect.height, window.innerHeight, grab.y)}px`;
      }
      frame = requestAnimationFrame(keepInWindow);
    };
    frame = requestAnimationFrame(keepInWindow);
    return () => cancelAnimationFrame(frame);
  }, [dragging, grab]);

  if (!source) return null;

  return (
    <div ref={box} style={{ translate: `${grab.x}px ${grab.y}px` }}>
      <div
        {...{ [DRAG_LABEL]: "" }}
        data-preview={command === null ? PreviewState.Object : PreviewState.Command}
        data-destructive={destructive || undefined}
        className="w-max rounded bg-canvas px-2 py-1 whitespace-nowrap shadow ring-1 ring-(color:--preview-ring)"
      >
        {command === null ? (
          label(source)
        ) : (
          <>
            <span className="text-muted">$</span> {command}
          </>
        )}
      </div>
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
        const rect = operation.source?.element?.getBoundingClientRect();
        const { x, y } = operation.position.initial;
        const grab = rect ? { x: x - rect.left, y: y - rect.top } : { x: 0, y: 0 };
        useDragStore.getState().start(source, shift, grab);
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
      <CancelOnRightClick />
      <DragOverlay dropAnimation={null}>
        <DragPreview />
      </DragOverlay>
    </DragDropProvider>
  );
}
