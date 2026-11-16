import type { Change } from "@/types";

export function change(id: string, overrides: Partial<Change> = {}): Change {
  return {
    change_id: id,
    short: id,
    short_prefix: id,
    commit_id: id,
    parents: [],
    desc: id,
    bookmarks: [],
    unsynced_bookmarks: [],
    wc: false,
    immutable: false,
    empty: false,
    conflict: false,
    ...overrides,
  };
}
