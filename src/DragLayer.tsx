import { useEffect, useRef, type ReactNode } from "react";
import { DragDropProvider, DragOverlay, useDragDropManager } from "@dnd-kit/react";

import { DRAG_LABEL } from "@/core/dnd/collision";
import type { Command } from "@/core/command";
import { Slot, slotAt, type DropData } from "@/core/dnd/model";
import { labelOf, type DragData, type DragObject } from "@/core/dnd/objects";
import { selectCommand, selectOutcome, selectTone, useDragStore } from "@/store/drag";
import { execute } from "@/store/execute";
import { useTerminalStore } from "@/store/terminal";

const PreviewState = { Object: "object", Command: "command" } as const;

function useTrackShiftWhileDragging() {
  const dragging = useDragStore((s) => s.object !== null);
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
  const dragging = useDragStore((s) => s.object !== null);
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

function DragPreview() {
  const object = useDragStore((s) => s.object);
  const grab = useDragStore((s) => s.grab);
  const command = useDragStore(selectCommand);
  const tone = useDragStore(selectTone);
  const box = useRef<HTMLDivElement>(null);
  const dragging = object !== null;

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

  if (!object) return null;

  return (
    <div ref={box} style={{ translate: `${grab.x}px ${grab.y}px` }}>
      <div
        {...{ [DRAG_LABEL]: "" }}
        data-preview={command === null ? PreviewState.Object : PreviewState.Command}
        data-tone={tone ?? undefined}
        className="w-max rounded bg-canvas px-2 py-1 whitespace-nowrap shadow ring-1 ring-(color:--preview-ring)"
      >
        {command === null ? (
          labelOf(object)
        ) : (
          <>
            <span className="text-command">$</span> {command}
          </>
        )}
      </div>
    </div>
  );
}

type Entity<T> = { data: Partial<T> } | null | undefined;

const objectOf = (draggable: Entity<DragData>): DragObject | null => draggable?.data.object ?? null;

function dropDataOf(droppable: Entity<DropData>): DropData | null {
  const { handler, group, tone } = droppable?.data ?? {};
  return handler && group && tone ? { handler, group, tone } : null;
}

function drop(command: Command) {
  if (command.kind === "insert") return useTerminalStore.getState().insertIntoTerminal(`${command.text} `);

  void execute(command);
}

export function DragLayer({ children }: { children: ReactNode }) {
  useTrackShiftWhileDragging();
  return (
    <DragDropProvider
      onDragStart={({ operation }) => {
        const object = objectOf(operation.source);
        if (!object) return;

        const shift = operation.activatorEvent instanceof PointerEvent && operation.activatorEvent.shiftKey;
        const rect = operation.source?.element?.getBoundingClientRect();
        const { x, y } = operation.position.initial;
        const grab = rect ? { x: x - rect.left, y: y - rect.top } : { x: 0, y: 0 };
        useDragStore.getState().start(object, shift, grab);
      }}
      onDragMove={({ operation }) => {
        const { target } = operation;
        const data = dropDataOf(target);
        if (!target || !data) return useDragStore.getState().over(null, Slot.Onto);

        const rect = target.shape?.boundingRectangle;
        if (!rect) return;

        useDragStore
          .getState()
          .over({ id: String(target.id), ...data }, slotAt(operation.position.current.y, rect.top, rect.height));
      }}
      onDragEnd={({ canceled }) => {
        const state = useDragStore.getState();
        const outcome = canceled ? null : selectOutcome(state);
        if (outcome) drop(outcome.command);
        state.end();
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
