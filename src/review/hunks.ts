import type { DiffLine, FileView, Marks } from "@/types";

export const HunkState = {
  Reviewed: "reviewed",
  Unreviewed: "unreviewed",
  Changed: "changed",
} as const;
export type HunkState = (typeof HunkState)[keyof typeof HunkState];

export interface HunkPos {
  path: string;
  group: number;
}

/** A hunk nobody marked is `Changed` when the file holds marks that match no current hunk: one was reviewed, then edited. */
export function hunkState(file: FileView, marks: Marks, group: number): HunkState {
  const marked = marks[file.path] ?? [];
  if (marked.includes(file.digests[group])) return HunkState.Reviewed;
  return marked.some((digest) => !file.digests.includes(digest)) ? HunkState.Changed : HunkState.Unreviewed;
}

/** `null` for a file with nothing to review. */
export function fileState(file: FileView, marks: Marks): HunkState | null {
  const states = file.digests.map((_, group) => hunkState(file, marks, group));
  if (states.length === 0) return null;
  if (states.includes(HunkState.Changed)) return HunkState.Changed;
  return states.every((s) => s === HunkState.Reviewed) ? HunkState.Reviewed : HunkState.Unreviewed;
}

const hunkPositions = (files: FileView[]): HunkPos[] =>
  files.flatMap((f) => f.digests.map((_, group) => ({ path: f.path, group })));

export const samePos = (a: HunkPos | null, b: HunkPos | null) =>
  a !== null && b !== null && a.path === b.path && a.group === b.group;

/** The next hunk in `step` direction that satisfies `wanted`, wrapping around the end. */
export function nextHunk(
  files: FileView[],
  marks: Marks,
  from: HunkPos | null,
  step: 1 | -1,
  wanted: (state: HunkState) => boolean = () => true,
): HunkPos | null {
  const all = hunkPositions(files);
  const at = all.findIndex((p) => samePos(p, from));
  const start = at !== -1 ? at : step === 1 ? -1 : all.length;
  for (let i = 1; i <= all.length; i++) {
    const pos = all[(((start + step * i) % all.length) + all.length) % all.length];
    const file = files.find((f) => f.path === pos.path);
    if (file && wanted(hunkState(file, marks, pos.group))) return pos;
  }
  return null;
}

export interface Segment {
  group: number | null;
  lines: DiffLine[];
}

/** Splits a file's lines into hunks and single lines between them. */
export function segments(lines: DiffLine[]): Segment[] {
  const out: Segment[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (line.group !== null && last?.group === line.group) last.lines.push(line);
    else out.push({ group: line.group, lines: [line] });
  }
  return out;
}
