import { displayCommand } from "@/core/jj";
import type { HunkRef } from "@/types";

export type JjCommand = { kind: "jj"; args: string[]; hunk?: HunkRef };
export type Command = JjCommand | { kind: "insert"; text: string };

export const jj = (args: string[], hunk?: HunkRef): Command => ({ kind: "jj", args, ...(hunk && { hunk }) });

export const insert = (text: string): Command => ({ kind: "insert", text });

export function describe(command: Command): string {
  return command.kind === "jj" ? displayCommand(command.args) : command.text;
}
