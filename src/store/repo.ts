import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import * as api from "@/api";
import { useSettingsStore } from "@/store/settings";
import { startSync } from "@/store/sync";
import type { RepoInfo } from "@/types";

export const RepoStatus = {
  Pending: "pending",
  Welcome: "welcome",
  Open: "open",
} as const;
export type RepoStatus = (typeof RepoStatus)[keyof typeof RepoStatus];

interface RepoState {
  status: RepoStatus;
  opening: boolean;
  error: string | null;
  fatal: string | null;
  start: () => Promise<void>;
  open: (path: string) => Promise<void>;
  pick: () => Promise<void>;
}

export const useRepoStore = create<RepoState>((set, get) => {
  const enter = async (info: RepoInfo) => {
    try {
      await useSettingsStore.getState().rememberRepo(info.root);
      await startSync(info);
      set({ opening: false, status: RepoStatus.Open });
    } catch (e) {
      set({ opening: false, fatal: api.errorMessage(e) });
    }
  };

  const openPath = async (path: string) => {
    let info;
    try {
      info = await api.openRepo(path);
    } catch (e) {
      set({ opening: false, status: RepoStatus.Welcome, error: api.errorMessage(e) });
      return;
    }
    await enter(info);
  };

  return {
    status: RepoStatus.Pending,
    opening: false,
    error: null,
    fatal: null,

    start: async () => {
      if (get().opening) return;

      set({ opening: true });
      const alreadyOpen = await api.currentRepo();
      if (alreadyOpen) return enter(alreadyOpen);

      const dir = await api.startDir();
      if (dir) return openPath(dir);

      set({ opening: false, status: RepoStatus.Welcome });
    },

    open: async (path) => {
      if (get().opening || get().status === RepoStatus.Open) return;

      set({ opening: true, error: null });
      await openPath(path);
    },

    pick: async () => {
      try {
        const dir = await pickFolder({ directory: true });
        if (dir) {
          await get().open(dir);
        }
      } catch (e) {
        set({ error: api.errorMessage(e) });
      }
    },
  };
});
