export const Theme = {
  Light: "light",
  Dark: "dark",
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

export interface Settings {
  theme: Theme | null;
  recentRepos: string[];
}

export interface Change {
  change_id: string;
  short: string;
  short_prefix: string;
  commit_id: string;
  parents: string[];
  desc: string;
  committed_ms: number;
  bookmarks: string[];
  unsynced_bookmarks: string[];
  wc: boolean;
  immutable: boolean;
  divergent: boolean;
  empty: boolean;
  conflict: boolean;
}

export interface Run {
  id: number;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  started: number;
  op_after: string[];
}

export interface Entry {
  id: string;
  time: number;
  command: string;
  gui: boolean;
  failed: boolean;
  detail: string;
}

export interface RepoInfo {
  root: string;
  default_revset: string;
}

export const FileStatus = {
  Added: "added",
  Modified: "modified",
  Deleted: "deleted",
  Renamed: "renamed",
} as const;
export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

export const LineKind = {
  Context: "context",
  Added: "added",
  Removed: "removed",
  Separator: "separator",
} as const;
export type LineKind = (typeof LineKind)[keyof typeof LineKind];

interface Span {
  text: string;
  token: string;
}

export interface DiffLine {
  old: number | null;
  new: number | null;
  kind: LineKind;
  spans: Span[];
}

export const BlockKind = {
  Hunk: "hunk",
  Line: "line",
} as const;
export type BlockKind = (typeof BlockKind)[keyof typeof BlockKind];

/** A hunk, identified by its key, or a line outside any hunk. */
export type Block =
  | { kind: typeof BlockKind.Hunk; key: string; lines: DiffLine[] }
  | { kind: typeof BlockKind.Line; line: DiffLine };

export interface FileView {
  path: string;
  old_path: string | null;
  old_mode: string | null;
  mode: string | null;
  status: FileStatus;
  binary: boolean;
  generated: boolean;
  blocks: Block[];
}

export type Marks = Record<string, string[]>;

export const HunkOp = {
  Keep: "keep",
  Revert: "revert",
} as const;
export type HunkOp = (typeof HunkOp)[keyof typeof HunkOp];

export interface HunkId {
  path: string;
  key: string;
}

export interface HunkRef extends HunkId {
  op: HunkOp;
}
