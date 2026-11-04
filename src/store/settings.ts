import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

import { Theme } from "@/types";

interface Settings {
  theme: Theme | null;
  recentRepos: string[];
}

const DEFAULTS: Settings = { theme: null, recentRepos: [] };
const STORE_FILE = "settings.json";
const MAX_RECENT_REPOS = 10;

interface SettingsState extends Settings {
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  rememberRepo: (root: string) => Promise<void>;
  forgetRepo: (root: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  init: async () => {
    const store = await load(STORE_FILE);
    const saved = await store.get<Partial<Settings>>("settings");
    const theme = saved?.theme ?? DEFAULTS.theme;
    const recentRepos = saved?.recentRepos ?? DEFAULTS.recentRepos;
    await getCurrentWindow().setTheme(theme);
    set({ theme, recentRepos, loaded: true });
  },
  update: async (patch) => {
    set(patch);
    const { theme, recentRepos } = get();
    await getCurrentWindow().setTheme(theme);
    const store = await load(STORE_FILE);
    await store.set("settings", { theme, recentRepos });
  },
  rememberRepo: (root) =>
    get().update({
      recentRepos: [root, ...get().recentRepos.filter((r) => r !== root)].slice(0, MAX_RECENT_REPOS),
    }),
  forgetRepo: (root) => get().update({ recentRepos: get().recentRepos.filter((r) => r !== root) }),
}));
