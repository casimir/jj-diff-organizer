import { HunkState, hunkKeys, hunkState, isCollapsed } from "@/core/hunks";
import type { FileView, Marks } from "@/types";

/**
 * A file, or one of its hunks, picked in a change.
 *
 * @remarks
 * A file without `hunk` is selected as a whole: collapsed, or without hunks.
 */
export interface FileSelection {
  path: string;
  hunk?: string;
}

/** A change, optionally narrowed to one of its files, then one of its hunks. */
export interface Selection {
  change: string;
  file?: FileSelection;
}

/** What a selection points into. */
export interface Data {
  files: FileView[];
  marks: Marks;
  collapse: Record<string, boolean>;
  reviewable: boolean;
}

export const collapsedIn = (file: FileView, { marks, collapse, reviewable }: Data) =>
  isCollapsed(file, marks, collapse, reviewable);

/**
 * Returns whether a file's hunks are its leaves.
 *
 * @remarks
 * Any other file is a leaf itself.
 */
export const showsHunks = (file: FileView, collapsed: boolean) => !collapsed && hunkKeys(file).length > 0;

export const sameLeaf = (a: FileSelection | undefined, b: FileSelection | undefined) =>
  !!a && !!b && a.path === b.path && a.hunk === b.hunk;

export const sameSelection = (a: Selection, b: Selection) => a.change === b.change && (a.file === b.file || sameLeaf(a.file, b.file));

const leavesOf = (file: FileView, data: Data): FileSelection[] =>
  showsHunks(file, collapsedIn(file, data))
    ? hunkKeys(file).map((hunk) => ({ path: file.path, hunk }))
    : [{ path: file.path }];

const leaves = (data: Data): FileSelection[] => data.files.flatMap((file) => leavesOf(file, data));

/**
 * Returns the selection moved onto the nearest leaf that exists.
 *
 * @remarks
 * The same hunk, else the file's first leaf, else the first file's.
 */
export function fit(selection: Selection, data: Data): Selection {
  const wanted = selection.file;
  const file = data.files.find((f) => f.path === wanted?.path) ?? data.files[0];
  if (!file) return { change: selection.change };

  const options = leavesOf(file, data);
  const kept = file.path === wanted?.path ? options.find((leaf) => leaf.hunk === wanted.hunk) : undefined;
  return { change: selection.change, file: kept ?? options[0] };
}

/** Returns the selection moved `step` files away, or unchanged past either end. */
export function moveFile(selection: Selection, data: Data, step: 1 | -1): Selection {
  const at = data.files.findIndex((f) => f.path === selection.file?.path);
  const next = data.files[at === -1 ? 0 : at + step];
  return next ? fit({ change: selection.change, file: { path: next.path } }, data) : selection;
}

/**
 * Returns the selection kept within the viewport.
 *
 * @remarks
 * A selection that left it through the top or the bottom lands on the first or the last visible leaf.
 */
export function scrolled(selection: Selection, data: Data, visible: FileSelection[]): Selection {
  const first = visible[0];
  const last = visible.at(-1);
  if (!selection.file || !first || !last || visible.some((leaf) => sameLeaf(leaf, selection.file))) return selection;

  const all = leaves(data);
  const left = all.findIndex((leaf) => sameLeaf(leaf, selection.file));
  const leftThroughTop = left < all.findIndex((leaf) => sameLeaf(leaf, first));
  return { change: selection.change, file: leftThroughTop ? first : last };
}

interface Walk {
  /** The review states of hunks to visit. */
  wanted?: (state: HunkState) => boolean;
  /** The files whose hunks are excluded. */
  skip?: (file: FileView) => boolean;
}

const hunksOf = (files: FileView[]): Required<FileSelection>[] =>
  files.flatMap((f) => hunkKeys(f).map((hunk) => ({ path: f.path, hunk })));

/**
 * Returns the next hunk in `step` direction, wrapping around the end, or `null` when none matches.
 *
 * @remarks
 * From a selected file, the walk leaves that file's hunks behind in `step` direction.
 */
export function nextHunk(
  files: FileView[],
  marks: Marks,
  from: FileSelection | undefined,
  step: 1 | -1,
  { wanted = () => true, skip = () => false }: Walk = {},
): Required<FileSelection> | null {
  const all = hunksOf(files);
  const start = startIndex(files, all, from, step);
  for (let i = 1; i <= all.length; i++) {
    const pos = all[(((start + step * i) % all.length) + all.length) % all.length];
    const file = files.find((f) => f.path === pos.path);
    if (file && !skip(file) && wanted(hunkState(file, marks, pos.hunk))) return pos;
  }
  return null;
}

/**
 * Returns the index just outside the walk's first candidate.
 *
 * @remarks
 * The selected hunk, or the gap a selected file or a missing selection stands in.
 */
function startIndex(files: FileView[], all: FileSelection[], from: FileSelection | undefined, step: 1 | -1): number {
  if (from && from.hunk === undefined) {
    const before = files
      .slice(0, files.findIndex((f) => f.path === from.path))
      .reduce((n, f) => n + hunkKeys(f).length, 0);
    return step === 1 ? before - 1 : before;
  }

  const at = all.findIndex((p) => sameLeaf(p, from));
  if (at !== -1) return at;

  return step === 1 ? -1 : all.length;
}
