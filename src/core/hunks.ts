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

const hunkStates = (files: FileView[], marks: Marks): HunkState[] =>
  files.flatMap((file) => hunkKeys(file).map((key) => hunkState(file, marks, key)));

/** Returns the state summarizing the hunks of `files`, or `null` when they have none. */
export function filesState(files: FileView[], marks: Marks): HunkState | null {
  const states = hunkStates(files, marks);
  if (states.length === 0) return null;
  if (states.includes(HunkState.Changed)) return HunkState.Changed;

  return states.every((s) => s === HunkState.Reviewed) ? HunkState.Reviewed : HunkState.Unreviewed;
}

export const fileState = (file: FileView, marks: Marks): HunkState | null => filesState([file], marks);

/**
 * Returns how many of `files` have nothing left to review, or `null` while none is reviewed.
 *
 * @remarks Files without hunks count as done: they have nothing to review.
 */
export function reviewProgress(files: FileView[], marks: Marks): number | null {
  const states = files.map((file) => fileState(file, marks));
  if (!states.includes(HunkState.Reviewed)) return null;

  return states.filter((s) => s === HunkState.Reviewed || s === null).length;
}

/** Returns whether a review action on `files` marks them, rather than clears them. */
export const needsReview = (files: FileView[], marks: Marks): boolean =>
  hunkStates(files, marks).some((s) => s !== HunkState.Reviewed);

export function isCollapsed(
  file: FileView,
  marks: Marks,
  collapse: Record<string, boolean>,
  reviewable: boolean,
): boolean {
  const review = reviewable && fileState(file, marks) === HunkState.Reviewed;
  const automatic = file.generated || review;
  const manual = collapse[file.path];

  return manual ?? automatic;
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
