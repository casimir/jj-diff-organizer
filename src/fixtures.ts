import { BlockKind, FileStatus, type Change, type FileView } from "@/types";

export function change(id: string, overrides: Partial<Change> = {}): Change {
  return {
    change_id: id,
    short: id,
    short_prefix: id,
    commit_id: id,
    parents: [],
    desc: id,
    committed_ms: 0,
    bookmarks: [],
    unsynced_bookmarks: [],
    wc: false,
    immutable: false,
    empty: false,
    conflict: false,
    ...overrides,
  };
}

export function file(path: string, keys: string[]): FileView {
  const blocks = keys.map((key) => ({ kind: BlockKind.Hunk, key, lines: [] }));
  return { path, old_path: null, status: FileStatus.Modified, binary: false, blocks };
}
