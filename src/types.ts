export const Theme = {
  Light: "light",
  Dark: "dark",
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

export interface Change {
  change_id: string;
  short: string;
  short_prefix: string;
  commit_id: string;
  parents: string[];
  desc: string;
  bookmarks: string[];
  unsynced_bookmarks: string[];
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
  group: number | null;
  spans: Span[];
}

export interface FileView {
  path: string;
  old_path: string | null;
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
