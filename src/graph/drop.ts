import { HunkOp, type Change, type HunkRef } from "@/types";

export const Zone = {
  Onto: "onto",
  Above: "above",
  Below: "below",
} as const;
export type Zone = (typeof Zone)[keyof typeof Zone];

export type DragSource =
  | { kind: "change"; change: Change }
  | { kind: "bookmark"; name: string }
  | { kind: "wc"; change: Change }
  | { kind: "file"; from: Change; path: string; renamedFrom: string | null }
  | { kind: "hunk"; from: Change; path: string; digest: string };

export const HUNK_TOOL = "jjdo-hunk";

const EDGE = 0.25;

export function zoneAt(y: number, top: number, height: number): Zone {
  const ratio = (y - top) / height;
  if (ratio < EDGE) return Zone.Above;
  if (ratio > 1 - EDGE) return Zone.Below;
  return Zone.Onto;
}

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

function filesetPath(path: string): string {
  return SAFE_PATH.test(path) ? path : `root-file:"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function dropArgs(
  source: DragSource,
  target: Change,
  zone: Zone,
  shift: boolean,
): string[] | null {
  switch (source.kind) {
    case "change": {
      if (source.change.change_id === target.change_id) return null;
      if (zone === Zone.Onto && shift) return ["rebase", "--revisions", source.change.short, "--onto", target.short];
      if (zone === Zone.Onto) {
        if (source.change.immutable || target.immutable) return null;
        return ["squash", "--from", source.change.short, "--into", target.short, "--use-destination-message"];
      }
      const placement = zone === Zone.Above ? "--insert-after" : "--insert-before";
      return ["rebase", shift ? "--source" : "--revisions", source.change.short, placement, target.short];
    }
    case "bookmark":
      if (target.bookmarks.includes(source.name)) return null;
      return ["bookmark", "set", source.name, "--revision", target.short, ...(shift ? ["--allow-backwards"] : [])];
    case "wc":
      if (source.change.change_id === target.change_id) return null;
      return ["edit", target.short];
    case "file": {
      if (source.from.change_id === target.change_id || source.from.immutable || target.immutable) return null;

      const paths = source.renamedFrom ? [source.renamedFrom, source.path] : [source.path];
      return [
        "squash", "--from", source.from.short, "--into", target.short, "--use-destination-message",
        ...paths.map(filesetPath),
      ];
    }
    case "hunk":
      if (source.from.change_id === target.change_id || source.from.immutable || target.immutable) return null;

      return [
        "squash", "--from", source.from.short, "--into", target.short, "--use-destination-message",
        "--tool", HUNK_TOOL, filesetPath(source.path),
      ];
  }
}

const RESTORE_DESCENDANTS = "--restore-descendants";

export function trashArgs(source: DragSource, shift: boolean): string[] | null {
  const keepDescendants = shift ? [RESTORE_DESCENDANTS] : [];
  switch (source.kind) {
    case "change":
      if (source.change.immutable) return null;

      return ["abandon", source.change.short, ...keepDescendants];
    case "bookmark":
      return ["bookmark", shift ? "forget" : "delete", source.name];
    case "wc":
      return null;
    case "file": {
      if (source.from.immutable) return null;

      const paths = source.renamedFrom ? [source.renamedFrom, source.path] : [source.path];
      return ["restore", "--changes-in", source.from.short, ...keepDescendants, ...paths.map(filesetPath)];
    }
    case "hunk":
      if (source.from.immutable) return null;

      return ["diffedit", "-r", source.from.short, "--tool", HUNK_TOOL, ...keepDescendants, filesetPath(source.path)];
  }
}

const PLAIN = /^[A-Za-z0-9\-_./:=@+,%]+$/;

export function shellQuote(arg: string): string {
  return PLAIN.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

export function displayCommand(args: string[]): string {
  return ["jj", ...args.map(shellQuote)].join(" ");
}

export type DropAction =
  | { kind: "jj"; args: string[]; hunk?: HunkRef; destructive: boolean }
  | { kind: "insert"; text: string };

export interface DropContext {
  zone: Zone;
  shift: boolean;
}

export type DropEffect = (source: DragSource, context: DropContext) => DropAction | null;

const TERMINAL_KINDS = ["bookmark", "change", "file"] as const;
type TerminalSource = Extract<DragSource, { kind: (typeof TERMINAL_KINDS)[number] }>;

const terminalKinds: readonly string[] = TERMINAL_KINDS;

function isTerminalSource(source: DragSource): source is TerminalSource {
  return terminalKinds.includes(source.kind);
}

function terminalText(source: TerminalSource): string {
  switch (source.kind) {
    case "bookmark":
      return shellQuote(source.name);
    case "change":
      return source.change.short;
    case "file":
      return shellQuote(source.path);
  }
}

export const dragProps = (source: DragSource) => ({ type: source.kind, data: { source } });

export const dropProps = (effect: DropEffect) => ({ data: { effect } });

const hunkRef = (source: DragSource, op: HunkOp): HunkRef | undefined =>
  source.kind === "hunk" ? { op, path: source.path, digest: source.digest } : undefined;

export const changeEffect =
  (target: Change): DropEffect =>
    (source, { zone, shift }) => {
      const args = dropArgs(source, target, zone, shift);
      if (!args) return null;

      return { kind: "jj", args, hunk: hunkRef(source, HunkOp.Keep), destructive: false };
    };

export const trashEffect: DropEffect = (source, { shift }) => {
  const args = trashArgs(source, shift);
  if (!args) return null;

  return { kind: "jj", args, hunk: hunkRef(source, HunkOp.Revert), destructive: true };
};

const CONTEXTS: DropContext[] = Object.values(Zone).flatMap((zone) => [
  { zone, shift: false },
  { zone, shift: true },
]);

export const dropActions = (effect: DropEffect, source: DragSource): DropAction[] =>
  CONTEXTS.flatMap((context) => effect(source, context) ?? []);

export const isDestructive = (action: DropAction): boolean => action.kind === "jj" && action.destructive;

export const PreviewState = { Object: "object", Command: "command" } as const;
export type PreviewState = (typeof PreviewState)[keyof typeof PreviewState];

export const DropState = { Candidate: "candidate", ...Zone } as const;
export type DropState = (typeof DropState)[keyof typeof DropState];

export const terminalEffect: DropEffect = (source) =>
  isTerminalSource(source) ? { kind: "insert", text: terminalText(source) } : null;

export function describeAction(action: DropAction): string {
  return action.kind === "jj" ? displayCommand(action.args) : action.text;
}
