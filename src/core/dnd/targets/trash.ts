import { jj } from "@/core/command";
import { onto, type Handler } from "@/core/dnd/model";
import { filesetPath, filesetPaths, HUNK_TOOL } from "@/core/jj";
import { HunkOp } from "@/types";

const RESTORE_DESCENDANTS = "--restore-descendants";

export const trashHandler: Handler = (object, { shift }) => {
  const keepDescendants = shift ? [RESTORE_DESCENDANTS] : [];
  switch (object.kind) {
    case "change":
      if (object.change.immutable) return null;

      return onto(jj(["abandon", object.change.short, ...keepDescendants]));
    case "bookmark":
      return onto(jj(["bookmark", shift ? "forget" : "delete", object.name]));
    case "wc":
      return null;
    case "file": {
      if (object.from.immutable) return null;

      return onto(jj(["restore", "--changes-in", object.from.short, ...keepDescendants, ...filesetPaths(object)]));
    }
    case "hunk": {
      if (object.from.immutable) return null;

      const { from, path, key } = object;
      const args = ["diffedit", "-r", from.short, "--tool", HUNK_TOOL, ...keepDescendants, filesetPath(path)];
      return onto(jj(args, { op: HunkOp.Revert, path, key }));
    }
  }
};
