import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { Change, Entry, FileView, HunkRef, Marks, RepoInfo, Run } from "@/types";

export const startDir = () => invoke<string | null>("start_dir");
export const currentRepo = () => invoke<RepoInfo | null>("current_repo");
export const openRepo = (path: string) => invoke<RepoInfo>("open_repo", { path });
export const graph = (revset: string) => invoke<Change[]>("graph", { revset });
export const successors = (revset: string, changeId: string) =>
  invoke<string[]>("successors", { revset, changeId });
export const show = (changeId: string) => invoke<FileView[]>("show", { changeId });
export const marks = (changeId: string) => invoke<Marks>("marks", { changeId });
export const reviewSet = (changeId: string, path: string, digests: string[], reviewed: boolean, current: string[]) =>
  invoke<void>("review_set", { changeId, path, digests, reviewed, current });
export const history = () => invoke<Entry[]>("history");
export const runJj = (args: string[], hunk?: HunkRef) => invoke<Run>("run_jj", { args, hunk });

export function ptyStart(
  cols: number,
  rows: number,
  onData: (bytes: Uint8Array) => void,
  onExit: () => void,
) {
  const channel = new Channel<ArrayBuffer | "exit">();
  channel.onmessage = (message) =>
    message === "exit" ? onExit() : onData(new Uint8Array(message));
  return invoke<void>("pty_start", { cols, rows, channel });
}
export const ptyWrite = (data: string) => invoke<void>("pty_write", { data });
export const ptyResize = (cols: number, rows: number) => invoke<void>("pty_resize", { cols, rows });

export const onRepoChanged = (handler: () => void) => getCurrentWebviewWindow().listen("repo-changed", handler);
export const onReviewChanged = (handler: (changeIds: string[]) => void) =>
  getCurrentWebviewWindow().listen<string[]>("review-changed", (event) => handler(event.payload));

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
