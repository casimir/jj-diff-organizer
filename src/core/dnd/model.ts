import type { Command } from "@/core/command";
import type { DragObject } from "@/core/dnd/objects";

export const Slot = {
  Onto: "onto",
  Above: "above",
  Below: "below",
} as const;
export type Slot = (typeof Slot)[keyof typeof Slot];

const EDGE = 0.25;

export function slotAt(y: number, top: number, height: number): Slot {
  const ratio = (y - top) / height;
  if (ratio < EDGE) return Slot.Above;
  if (ratio > 1 - EDGE) return Slot.Below;
  return Slot.Onto;
}

export interface Context {
  slot: Slot;
  shift: boolean;
}

export interface Outcome {
  slot: Slot;
  command: Command;
}

export type Handler = (object: DragObject, context: Context) => Outcome | null;

export const onto = (command: Command): Outcome => ({ slot: Slot.Onto, command });

const CONTEXTS: Context[] = Object.values(Slot).flatMap((slot) => [
  { slot, shift: false },
  { slot, shift: true },
]);

export const accepts = (handler: Handler, object: DragObject): boolean =>
  CONTEXTS.some((context) => handler(object, context) !== null);

export const Tone = { Accent: "accent", Danger: "danger" } as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

export interface DropData {
  handler: Handler;
  group: string;
  tone: Tone;
}

export const dropProps = (data: DropData) => ({ data });

export const DropState = { Candidate: "candidate", ...Slot } as const;
export type DropState = (typeof DropState)[keyof typeof DropState];
