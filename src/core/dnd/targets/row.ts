import { jj } from "@/core/command";
import { onto, Slot, type Handler, type Outcome } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { filesetPath, filesetPaths, HUNK_TOOL } from "@/core/jj";
import { HunkOp, type Change } from "@/types";

export const GRAPH_GROUP = "graph";

const insertFlag = (slot: Slot): string => (slot === Slot.Above ? "--insert-after" : "--insert-before");

type ReviewObject = Extract<DragObject, { kind: "file" | "hunk" }>;

function squash(object: ReviewObject, target: Change, slot: Slot): Outcome | null {
  const { from } = object;
  if (from.immutable) return null;

  if (slot === Slot.Onto && from.change_id === target.change_id) return null;

  if (slot !== Slot.Above && target.immutable) return null;

  const destination =
    slot === Slot.Onto ? ["--into", target.short, "--use-destination-message"] : [insertFlag(slot), target.short];
  if (object.kind === "hunk") {
    const args = ["squash", "--from", from.short, ...destination, "--tool", HUNK_TOOL, filesetPath(object.path)];
    return { slot, command: jj(args, { op: HunkOp.Keep, path: object.path, digest: object.digest }) };
  }

  return { slot, command: jj(["squash", "--from", from.short, ...destination, ...filesetPaths(object)]) };
}

export const rowHandler =
  (target: Change): Handler =>
  (object, { slot, shift }) => {
    switch (object.kind) {
      case "change": {
        if (object.change.change_id === target.change_id) return null;
        if (slot === Slot.Onto && shift) {
          return { slot, command: jj(["rebase", "--revisions", object.change.short, "--onto", target.short]) };
        }

        if (slot === Slot.Onto) {
          if (object.change.immutable || target.immutable) return null;

          return {
            slot,
            command: jj(["squash", "--from", object.change.short, "--into", target.short, "--use-destination-message"]),
          };
        }

        const mode = shift ? "--source" : "--revisions";
        return { slot, command: jj(["rebase", mode, object.change.short, insertFlag(slot), target.short]) };
      }
      case "bookmark":
        if (target.bookmarks.includes(object.name)) return null;

        return onto(
          jj(["bookmark", "set", object.name, "--revision", target.short, ...(shift ? ["--allow-backwards"] : [])]),
        );
      case "wc":
        if (object.change.change_id === target.change_id) return null;

        return onto(jj(["edit", target.short]));
      case "file":
      case "hunk":
        return squash(object, target, slot);
    }
  };
