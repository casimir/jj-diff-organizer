export const HUNK_TOOL = "jjdo-hunk";

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;

export function filesetPath(path: string): string {
  return SAFE_PATH.test(path) ? path : `root-file:"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** A renamed file moves as a whole: both its old and new paths. */
export function filesetPaths({ path, renamedFrom }: { path: string; renamedFrom: string | null }): string[] {
  return (renamedFrom ? [renamedFrom, path] : [path]).map(filesetPath);
}

const PLAIN = /^[A-Za-z0-9\-_./:=@+,%]+$/;

export function shellQuote(arg: string): string {
  return PLAIN.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`;
}

export function displayCommand(args: string[]): string {
  return ["jj", ...args.map(shellQuote)].join(" ");
}
