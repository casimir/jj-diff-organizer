import type { Change } from "@/types";

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

/** Name of the diff editor the backend defines for a hunk move (`HUNK_TOOL` in `crates/core/src/jj.rs`). */
export const HUNK_TOOL = "jjdo-hunk";

const EDGE = 0.25;

export function zoneAt(y: number, top: number, height: number): Zone {
  const ratio = (y - top) / height;
  if (ratio < EDGE) return Zone.Above;
  if (ratio > 1 - EDGE) return Zone.Below;
  return Zone.Onto;
}

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

/** A repo-relative path as a jj fileset argument. */
function filesetPath(path: string): string {
  return SAFE_PATH.test(path) ? path : `root-file:"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** `null` when dropping `source` on `target` makes no sense. */
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
    case "file":
    case "hunk": {
      if (source.from.change_id === target.change_id || source.from.immutable || target.immutable) return null;
      const tool = source.kind === "hunk" ? ["--tool", HUNK_TOOL] : [];
      const paths = source.kind === "file" && source.renamedFrom ? [source.renamedFrom, source.path] : [source.path];
      return [
        "squash", "--from", source.from.short, "--into", target.short, "--use-destination-message",
        ...tool, ...paths.map(filesetPath),
      ];
    }
  }
}

const PLAIN = /^[A-Za-z0-9\-_./:=@+,%]+$/;

export function shellQuote(arg: string): string {
  return PLAIN.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

/** Same text as `display_command` in `crates/core/src/jj.rs`, so a preview matches the history entry. */
export function displayCommand(args: string[]): string {
  return ["jj", ...args.map(shellQuote)].join(" ");
}
