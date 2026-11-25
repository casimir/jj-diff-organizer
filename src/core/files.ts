import type { FileView } from "@/types";

/** The files of one directory, or the root-level files when `dir` is `null`. */
export interface FileGroup {
  dir: string | null;
  files: FileView[];
}

const dirOf = (path: string): string | null => {
  const at = path.lastIndexOf("/");
  return at === -1 ? null : path.slice(0, at);
};

/**
 * Returns the files grouped by directory, directories sorted by path, root-level files last.
 *
 * @remarks
 * Groups are flat: `src` and `src/ui` are two groups. A file keeps its order within its group.
 */
export function groupFiles(files: FileView[]): FileGroup[] {
  const groups = new Map<string | null, FileView[]>();
  for (const file of files) {
    const dir = dirOf(file.path);
    groups.set(dir, [...(groups.get(dir) ?? []), file]);
  }

  return Array.from(groups, ([dir, members]) => ({ dir, files: members })).sort((a, b) => {
    if (a.dir === null || b.dir === null) return Number(a.dir === null) - Number(b.dir === null);

    return a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0;
  });
}
