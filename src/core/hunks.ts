import { BlockKind, LineKind, type FileView, type Marks } from "@/types";

export const HunkState = {
  Reviewed: "reviewed",
  Unreviewed: "unreviewed",
  Changed: "changed",
} as const;
export type HunkState = (typeof HunkState)[keyof typeof HunkState];

export const hunkKeys = (file: FileView): string[] =>
  file.blocks.flatMap((b) => (b.kind === BlockKind.Hunk ? [b.key] : []));

/** A hunk nobody marked is `Changed` when the file holds marks that match no current hunk: one was reviewed, then edited. */
export function hunkState(file: FileView, marks: Marks, key: string): HunkState {
  const marked = marks[file.path] ?? [];
  if (marked.includes(key)) return HunkState.Reviewed;

  const current = hunkKeys(file);
  return marked.some((d) => !current.includes(d)) ? HunkState.Changed : HunkState.Unreviewed;
}

export function fileState(file: FileView, marks: Marks): HunkState | null {
  const states = hunkKeys(file).map((key) => hunkState(file, marks, key));

  if (states.length === 0) return null;
  if (states.includes(HunkState.Changed)) return HunkState.Changed;

  return states.every((s) => s === HunkState.Reviewed) ? HunkState.Reviewed : HunkState.Unreviewed;
}

export function isCollapsed(
  file: FileView,
  marks: Marks,
  collapse: Record<string, boolean>,
  reviewable: boolean,
): boolean {
  return collapse[file.path] ?? (reviewable && fileState(file, marks) === HunkState.Reviewed);
}

interface Snapshot {
  files: FileView[];
  marks: Marks;
}

export function pruneCollapseOverrides(
  collapse: Record<string, boolean>,
  before: Snapshot,
  after: Snapshot,
): Record<string, boolean> {
  const state = ({ files, marks }: Snapshot, path: string) => {
    const file = files.find((f) => f.path === path);
    return file && { state: fileState(file, marks) };
  };
  return Object.fromEntries(
    Object.entries(collapse).filter(([path]) => {
      const was = state(before, path);
      const now = state(after, path);
      return was && now && was.state === now.state;
    }),
  );
}

export interface Stat {
  added: number;
  removed: number;
}

export function diffStat(files: FileView[]): Stat {
  const lines = files.flatMap((f) => f.blocks.flatMap((b) => (b.kind === BlockKind.Hunk ? b.lines : [])));
  return {
    added: lines.filter((l) => l.kind === LineKind.Added).length,
    removed: lines.filter((l) => l.kind === LineKind.Removed).length,
  };
}
