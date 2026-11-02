export const Theme = {
  Light: "light",
  Dark: "dark",
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

export interface Change {
  change_id: string;
  short: string;
  commit_id: string;
  parents: string[];
  desc: string;
  bookmarks: string[];
  wc: boolean;
  immutable: boolean;
  empty: boolean;
  conflict: boolean;
}

export interface Run {
  id: number;
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  op_before: string[];
  op_after: string[];
}

export interface Op {
  id: string;
  description: string;
  is_snapshot: boolean;
  time: { start: string };
  attributes: { args: string };
}

export type Entry = { source: "gui"; run: Run } | { source: "op_log"; op: Op; gui: boolean };

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
  group: number | null;
  spans: Span[];
}

export interface FileView {
  path: string;
  status: FileStatus;
  binary: boolean;
  digests: string[];
  lines: DiffLine[];
}

export type Marks = Record<string, string[]>;

export interface HunkRef {
  path: string;
  digest: string;
}
