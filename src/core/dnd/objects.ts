import type { Change, HunkId } from "@/types";

export type DragObject =
  | { kind: "change"; change: Change }
  | { kind: "bookmark"; name: string }
  | { kind: "wc"; change: Change }
  | { kind: "file"; from: Change; path: string; renamedFrom: string | null }
  | ({ kind: "hunk"; from: Change } & HunkId);

export function labelOf(object: DragObject): string {
  switch (object.kind) {
    case "change":
      return object.change.short;
    case "bookmark":
      return object.name;
    case "wc":
      return "@";
    case "file":
      return object.path;
    case "hunk":
      return `hunk of ${object.path}`;
  }
}

export interface DragData {
  object: DragObject;
}

export const dragProps = (object: DragObject) => ({ type: object.kind, data: { object } satisfies DragData });
