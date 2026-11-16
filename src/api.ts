import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText as readClipboard, writeText as writeClipboard } from "@tauri-apps/plugin-clipboard-manager";
import { open } from "@tauri-apps/plugin-dialog";
import { load } from "@tauri-apps/plugin-store";

import { IS_MAC } from "@/platform";
import type { Change, Entry, FileView, HunkRef, Marks, RepoInfo, Run, Settings, Theme } from "@/types";

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

export { readClipboard, writeClipboard };

export const pickFolder = () => open({ directory: true });

const SETTINGS_FILE = "settings.json";
const SETTINGS_KEY = "settings";

export async function loadSettings(): Promise<Partial<Settings> | undefined> {
  const store = await load(SETTINGS_FILE);
  return store.get<Partial<Settings>>(SETTINGS_KEY);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const store = await load(SETTINGS_FILE);
  await store.set(SETTINGS_KEY, settings);
}

export async function onSettingsChanged(handler: (saved: Partial<Settings> | undefined) => void) {
  const store = await load(SETTINGS_FILE);
  await store.onKeyChange<Partial<Settings>>(SETTINGS_KEY, handler);
}

export async function applyTheme(theme: Theme | null): Promise<void> {
  const win = getCurrentWindow();
  await win.setTheme(theme);
  if (theme === null && !IS_MAC) {
    const system = await win.theme();
    if (system) {
      await win.setTheme(system);
    }
  }
}
